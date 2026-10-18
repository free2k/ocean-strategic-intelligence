#!/usr/bin/env python3
"""Code-only release with staged real-data checks and automatic code rollback."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time

base = Path('/opt/ocean-intelligence')
stage = base / 'country-assessments-stage'
manifest = json.loads((stage / 'manifest.json').read_text())
old = Path(manifest['baseRelease'])
release = base / 'releases' / manifest['release']
backup = base / 'backups' / manifest['release']
node = '/usr/bin/node-20'
patched = {item['path'] for item in manifest['files']}
allowed = patched | set(manifest['testFiles'])
backup.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(backup, 0o700)
publish_lock = (base / 'ui-publish.lock').open('a')
fcntl.flock(publish_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def baseline():
    if (base / 'current').resolve() != old:
        raise RuntimeError('Current release changed; prepare a fresh manifest')
    for item in manifest['files']:
        path = Path(item['path'])
        if path.is_absolute() or '..' in path.parts or path.parts[0] != 'intelligence':
            raise RuntimeError('Unsafe program path')
        if sha(old / path) != item['previousSha256']:
            raise RuntimeError('Concurrent production edit: ' + str(path))


def run(args, name, cwd=release):
    with (backup / (name + '.log')).open('w') as log:
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError(name + ' failed; see protected deployment log')


def js(code, name, cwd=old):
    result = subprocess.run([node, '--input-type=module', '-e', code], cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        (backup / (name + '.log')).write_text(result.stderr)
        raise RuntimeError(name + ' failed; see protected deployment log')
    return json.loads(result.stdout)


auth = """
process.loadEnvFile('/opt/knowledge-base/.env');
const {createHmac}=await import('node:crypto');
const exp=String(Date.now()+180000),cookie=exp+'.'+createHmac('sha256',process.env.SITE_PASSWORD).update(exp).digest('hex');
async function get(path){const r=await fetch('http://127.0.0.1:3101'+path,{headers:{Cookie:'ocean_auth='+cookie},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Authenticated endpoint failed');return r.json();}
"""


def idle():
    return js(auth + "const c=await get('/api/collection'),p=await get('/api/period-reports'),t=await get('/api/processing-runs/current');console.log(JSON.stringify({idle:!c.running&&!p.items?.some(j=>['queued','running'].includes(j.status))&&!['queued','running','stopping'].includes(t.task?.status)}));", 'idle')['idle']


def snapshot_summary():
    value = json.loads((base / 'data/snapshot.json').read_bytes())
    value.get('industryRulePublication', {}).pop('appliedAt', None)
    return {'documents': len(value['documents']), 'series': len(value['series']),
            'businessHash': hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()}


db_probe = """
process.loadEnvFile('/opt/knowledge-base/.env');
const {createRequire}=await import('node:module');
const {Pool}=createRequire('/opt/knowledge-base/package.json')('pg');
const pool=new Pool({connectionString:process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:1});
const c=await pool.connect(),out={};try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
for(const table of ['ocean_intel.documents','ocean_intel.document_versions','ocean_intel.research','ocean_research.records']){
const {rows}=await c.query('SELECT id,md5(payload::text) AS hash FROM '+table+' ORDER BY id');out[table]=Object.fromEntries(rows.map(r=>[r.id,r.hash]));
}await c.query('ROLLBACK');console.log(JSON.stringify(out));}finally{c.release();await pool.end();}
"""


def switch(target):
    pending = base / 'current.country-assessments-next'
    pending.unlink(missing_ok=True)
    pending.symlink_to(target)
    os.replace(pending, base / 'current')
    subprocess.run(['pm2', 'restart', 'ocean-intelligence'], check=True, stdout=subprocess.DEVNULL)


baseline()
if not release.exists():
    shutil.copytree(old, release, symlinks=True)
    with tarfile.open(stage / 'program.tar.gz') as archive:
        members = archive.getmembers()
        if {m.name for m in members} != allowed or any(not m.isfile() for m in members):
            raise RuntimeError('Unexpected archive member')
        for member in members:
            path = Path(member.name)
            if path.is_absolute() or '..' in path.parts:
                raise RuntimeError('Unsafe archive path')
            dest = release / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as src, dest.open('wb') as out:
                shutil.copyfileobj(src, out)
    (release / '.country-assessments-manifest.json').write_text(json.dumps(manifest, indent=2))
elif not (release / '.country-assessments-manifest.json').is_file() or json.loads((release / '.country-assessments-manifest.json').read_text()) != manifest:
    raise RuntimeError('Release directory belongs to another artifact')
for item in manifest['files']:
    if sha(release / item['path']) != item['sha256']:
        raise RuntimeError('Artifact checksum mismatch: ' + item['path'])
    if Path(item['path']).suffix in ('.js', '.mjs'):
        run([node, '--check', str(release / item['path'])], 'syntax-' + Path(item['path']).stem)

if '--activate-staged' in sys.argv:
    receipt = json.loads((backup / 'staging.json').read_text())
    if receipt['release'] != str(release) or receipt['previousRelease'] != str(old):
        raise RuntimeError('Staging receipt does not match this artifact')
else:
    # Only the PostgreSQL TEMP-table tests receive a connection string. Child test
    # servers never inherit the production environment or production data directory.
    test_runner = """
    import {spawnSync} from 'node:child_process';import fs from 'node:fs';
    const env={...process.env};for(const key of Object.keys(env))if(/^(INTEL_|DATABASE_URL$|SITE_PASSWORD$|OPENAI_|CHAT_MODEL$|EMBEDDING_MODEL$)/.test(key))delete env[key];
    process.loadEnvFile('/opt/knowledge-base/.env');env.TEST_PROJECTION_DATABASE_URL=process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL;
    env.INTEL_SCHEDULE='false';env.INTEL_ENABLE_AI='false';env.INTEL_CAPTURE_ENABLED='false';
    const tests=fs.readdirSync('intelligence/tests').filter(p=>p.endsWith('.test.mjs')).sort().map(p=>'intelligence/tests/'+p);
    const result=spawnSync(process.execPath,['--loader','./intelligence/tests/browser-route-loader.mjs','--test','--test-reporter=tap',...tests],{env,stdio:'inherit'});process.exit(result.status??1);
    """
    with (backup / 'tests.log').open('w') as log:
        result = subprocess.run([node, '--input-type=module', '-e', test_runner], cwd=release, stdout=log, stderr=subprocess.STDOUT)
    tests_text = (backup / 'tests.log').read_text()
    failures = re.findall(r'^not ok \d+ - (.+)$', tests_text, re.MULTILINE)
    known = {
        'CSV supports quoted multiline, escaped quotes and missing capacities': ['intelligence/open-datasets.mjs', 'intelligence/tests/open-datasets.test.mjs'],
        'capture reader preserves Unicode source separators and escaped newlines across records': ['intelligence/research/capture-reader.mjs', 'intelligence/tests/research-capture-reader.test.mjs'],
    }
    if result.returncode:
        if set(failures) != set(known) or any(sha(old / p) != sha(release / p) for paths in known.values() for p in paths):
            raise RuntimeError('Staged test regression; service untouched')
        with (backup / 'baseline-tests.log').open('w') as log:
            baseline_result = subprocess.run([node, '--test', *[paths[-1] for paths in known.values()]], cwd=old, stdout=log, stderr=subprocess.STDOUT)
        if not baseline_result.returncode or set(re.findall(r'^not ok \d+ - (.+)$', (backup / 'baseline-tests.log').read_text(), re.MULTILINE)) != set(failures):
            raise RuntimeError('Baseline failure differs; service untouched')
    test_summary = {k: int(v) for k, v in re.findall(r'^# (tests|pass|fail|skipped) (\d+)$', tests_text, re.MULTILINE)}
    run([node, str(stage / 'verify-production.mjs'), '--root', str(release), '--output', str(backup / 'staged-data.json')], 'staged-data')
    staged = json.loads((backup / 'staged-data.json').read_text())
    receipt = {'status': 'staged', 'release': str(release), 'previousRelease': str(old), 'tests': test_summary, 'baselineFailures': failures, 'historicalProducts': staged['historicalProducts'], 'currentAssessments': staged['currentAssessments'], 'currentCases': staged['currentCases'], 'filterQueries': staged['filterQueriesVerified'], 'originalBodies': staged['pinnedOriginalBodiesVerified']}
    (backup / 'staging.json').write_text(json.dumps(receipt, indent=2))
if not {'--activate', '--activate-staged'} & set(sys.argv):
    print(json.dumps(receipt))
    sys.exit(0)

with (base / 'eia-daily.lock').open('a') as guard:
    fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
    baseline()
    if not idle():
        raise RuntimeError('Background processing is active; staged release retained')
    # Preserve unrelated live edits that were made after the candidate clone.
    for parent, dirs, files in os.walk(old, followlinks=False):
        for name in dirs + files:
            src = Path(parent) / name
            rel = src.relative_to(old)
            if str(rel) in allowed:
                continue
            dest = release / rel
            if src.is_symlink():
                if not dest.is_symlink() or os.readlink(dest) != os.readlink(src):
                    if dest.is_symlink() or dest.is_file():
                        dest.unlink()
                    dest.symlink_to(os.readlink(src))
            elif src.is_file() and sha(src) != sha(dest):
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
    before, db_before = snapshot_summary(), js(db_probe, 'data-before')
    shutil.copy2(base / 'data/snapshot.json', backup / 'snapshot-before.json')
    (backup / 'previous-release.txt').write_text(str(old) + '\n')
    (backup / 'data-before.json').write_text(json.dumps({'snapshot': before, 'database': db_before}))
    (backup / 'rollback.sh').write_text('#!/bin/sh\nset -eu\nln -s ' + str(old) + ' /opt/ocean-intelligence/current.country-rollback\nmv -Tf /opt/ocean-intelligence/current.country-rollback /opt/ocean-intelligence/current\npm2 restart ocean-intelligence\n')
    os.chmod(backup / 'rollback.sh', 0o700)
    other_pid = js("import {execFileSync} from 'node:child_process';console.log(JSON.stringify(JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='knowledge-base').pid));", 'other-service')
    baseline()
    try:
        switch(release)
        for _ in range(30):
            time.sleep(1)
            health = subprocess.run(['curl', '-fsS', '--max-time', '3', 'http://127.0.0.1:3101/api/health'], capture_output=True)
            if health.returncode == 0 and json.loads(health.stdout).get('ok'):
                break
        else:
            raise RuntimeError('New service failed its health check')
        run([node, str(stage / 'verify-production.mjs'), '--root', str(release), '--api', '--output', str(backup / 'live-data.json')], 'live-data')
        static = js(auth + "const {createHash}=await import('node:crypto'),fs=await import('node:fs/promises');const paths=['app.js','country-dossier.js','country-assessment.js','navigation.js','research-layout.css'];for(const path of paths){const r=await fetch('http://127.0.0.1:3101/'+path,{headers:{Cookie:'ocean_auth='+cookie}});if(!r.ok)throw Error('Static asset unavailable');const bytes=Buffer.from(await r.arrayBuffer()),local=await fs.readFile('intelligence/public/'+path);if(createHash('sha256').update(bytes).digest('hex')!==createHash('sha256').update(local).digest('hex'))throw Error('Stale static asset');}console.log(JSON.stringify({verifiedAssets:paths.length}));", 'static-assets', release)
        after, db_after = snapshot_summary(), js(db_probe, 'data-after', release)
        if before != after or any(db_after.get(table, {}).get(key) != digest for table, rows in db_before.items() for key, digest in rows.items()):
            raise RuntimeError('Existing business data changed during verification')
        other_after = js("import {execFileSync} from 'node:child_process';console.log(JSON.stringify(JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='knowledge-base').pid));", 'other-service-after')
        if other_after != other_pid:
            raise RuntimeError('Original site process changed during deployment')
        live = json.loads((backup / 'live-data.json').read_text())
        report = {**receipt, 'status': 'deployed', 'filterQueries': live['filterQueriesVerified'], 'originalBodies': live['pinnedOriginalBodiesVerified'], 'databaseMigration': False, 'existingDataPreserved': True, 'otherServicePidUnchanged': True, 'staticAssetsVerified': static['verifiedAssets'], 'productionReleaseId': live['releaseId'], 'originalVersionsVerified': live['originalVersionsVerified'], 'backup': str(backup)}
        (backup / 'deployment.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
    except BaseException:
        switch(old)
        (backup / 'rollback-triggered.txt').write_text('Candidate activation failed; previous code release restored.\n')
        raise
