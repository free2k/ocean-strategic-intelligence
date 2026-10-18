#!/usr/bin/env python3
"""Apply an explicit program manifest; preserve current runtime data and other edits."""
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
incoming = base / 'strategy-discovery-stage'
manifest = json.loads((incoming / 'manifest.json').read_text())
old = (base / 'current').resolve()
release = base / 'releases' / manifest['release']
backup = base / 'backups' / manifest['release']
node = '/usr/bin/node-20'
protected = {item['path'] for item in manifest['files']}
backup.mkdir(mode=0o700, parents=True, exist_ok=True)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None

def check_baseline():
    if str((base / 'current').resolve()) != manifest['baseRelease']:
        sys.exit('Current release changed; prepare a fresh manifest before publishing')
    for item in manifest['files']:
        p = Path(item['path'])
        if p.is_absolute() or '..' in p.parts or p.parts[0] != 'intelligence':
            sys.exit('Unsafe program path')
        if sha(old / p) != item['previousSha256']:
            sys.exit('Parallel production edit; service untouched: ' + str(p))

def run_node(code, cwd=old):
    r = subprocess.run([node, '--input-type=module', '-e', code], cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError('Server verification failed; see protected deployment logs')
    return json.loads(r.stdout)

auth = """
process.loadEnvFile('/opt/knowledge-base/.env');
const {createHmac}=await import('node:crypto');
const exp=String(Date.now()+120000),cookie=exp+'.'+createHmac('sha256',process.env.SITE_PASSWORD).update(exp).digest('hex');
async function get(path){const r=await fetch('http://127.0.0.1:3101'+path,{headers:{Cookie:'ocean_auth='+cookie},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('authenticated request failed');return r.json();}
"""

def snapshot_summary():
    raw = json.loads((base / 'data/snapshot.json').read_bytes())
    raw.get('industryRulePublication', {}).pop('appliedAt', None)
    return {'documents': len(raw['documents']), 'series': len(raw['series']),
            'points': sum(len(s['rows']) for s in raw['series']),
            'businessHash': hashlib.sha256(json.dumps(raw, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()}

db_probe = """
process.loadEnvFile('/opt/knowledge-base/.env');
const {createRequire}=await import('node:module'),{createHash}=await import('node:crypto');
const {Pool}=createRequire('/opt/knowledge-base/package.json')('pg');
const pool=new Pool({connectionString:process.env.INTEL_DATABASE_URL||process.env.DATABASE_URL,max:1});
const out={};try{await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
for(const table of ['sources','documents','entities','events','relations','observations','evidence','research','document_versions']){
 const {rows}=await pool.query('SELECT id,md5(payload::text) AS hash FROM ocean_intel.'+table+' ORDER BY id');
 out[table]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}await pool.query('ROLLBACK');console.log(JSON.stringify(out));}finally{await pool.end();}
"""

check_baseline()
if not release.exists():
    shutil.copytree(old, release, symlinks=True)
    with tarfile.open(incoming / 'program.tar.gz') as archive:
        for member in archive.getmembers():
            if member.name not in protected or not member.isfile():
                sys.exit('Unexpected archive member')
            dest = release / member.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(member) as src, dest.open('wb') as dst:
                shutil.copyfileobj(src, dst)
    (release / '.discovery-manifest.json').write_text(json.dumps(manifest, indent=2))
elif not (release / '.discovery-manifest.json').is_file() or json.loads((release / '.discovery-manifest.json').read_text()) != manifest:
    sys.exit('Release name already belongs to another artifact')
for item in manifest['files']:
    target = release / item['path']
    if sha(target) != item['sha256']:
        sys.exit('Artifact checksum failed')
    if target.suffix in ('.mjs', '.js'):
        subprocess.run([node, '--check', str(target)], check=True, stdout=subprocess.DEVNULL)
tests = ['core', 'open-datasets', 'iea-quant', 'experience', 'periods', 'strategy-scope', 'strategy-guided-inputs', 'strategy-workbench', 'strategy-engine', 'strategy-discovery']
with (backup / 'release-tests.log').open('w') as log:
    result = subprocess.run([node, '--test', *['intelligence/tests/' + name + '.test.mjs' for name in tests]], cwd=release, stdout=log, stderr=subprocess.STDOUT)
baseline_failures = []
if result.returncode:
    # Node 20 on this host already fails the Windows-1252 decoder assertion.
    # Establish that exact baseline failure on the running release; do not hide
    # new failures or alter an unrelated importer to make the UI release green.
    def failures(log):
        return re.findall(r'^not ok \d+ - (.+)$', log, re.MULTILINE)
    known = 'CSV supports quoted multiline, escaped quotes and missing capacities'
    actual = failures((backup / 'release-tests.log').read_text())
    with (backup / 'baseline-tests.log').open('w') as log:
        baseline = subprocess.run([node, '--test', 'intelligence/tests/open-datasets.test.mjs'], cwd=old, stdout=log, stderr=subprocess.STDOUT)
    original = failures((backup / 'baseline-tests.log').read_text())
    unchanged = all(sha(old / file) == sha(release / file) for file in ['intelligence/open-datasets.mjs', 'intelligence/tests/open-datasets.test.mjs'])
    if actual != [known] or original != [known] or not baseline.returncode or not unchanged:
        sys.exit('Staged release has a new regression; service untouched')
    baseline_failures = actual
if '--activate' not in sys.argv:
    print(json.dumps({'status': 'staged', 'release': str(release), 'productionChanged': False, 'baselineFailures': baseline_failures}))
    sys.exit(0)

with (base / 'eia-daily.lock').open('a') as guard:
    try:
        fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit('Existing publisher is busy; staged program retained, service untouched')
    check_baseline()
    idle = run_node(auth + "const c=await get('/api/collection'),p=await get('/api/period-reports');console.log(JSON.stringify({idle:!c.running&&!p.items?.some(j=>['queued','running'].includes(j.status))}));")
    if not idle['idle']:
        sys.exit('Background work is active; staged program retained, service untouched')
    # Copy forward files outside this explicit patch, including other live fixes.
    for parent, dirs, files in os.walk(old, followlinks=False):
        for name in dirs + files:
            src = Path(parent) / name
            rel = src.relative_to(old)
            if str(rel) in protected:
                continue
            dest = release / rel
            if src.is_symlink():
                if not dest.is_symlink() or os.readlink(dest) != os.readlink(src):
                    if dest.is_symlink() or dest.is_file(): dest.unlink()
                    dest.symlink_to(os.readlink(src))
            elif src.is_file() and sha(src) != sha(dest):
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
    shutil.copy2(base / 'data/snapshot.json', backup / 'snapshot-before.json')
    study_dir = base / 'data/strategy-research'
    originals = {p.name: sha(p) for p in study_dir.glob('*.json') if p.name != '_index.json'}
    before, db_before = snapshot_summary(), run_node(db_probe)
    (backup / 'previous-release.txt').write_text(str(old) + '\n')
    (backup / 'data-before.json').write_text(json.dumps({'snapshot': before, 'database': db_before, 'studyFiles': originals}, indent=2))
    check_baseline()
    pending = base / 'current.discovery-next'
    pending.unlink(missing_ok=True)
    pending.symlink_to(release)
    os.replace(pending, base / 'current')
    try:
        subprocess.run(['pm2', 'restart', 'ocean-intelligence'], check=True, stdout=subprocess.DEVNULL)
        for attempt in range(30):
            time.sleep(1)
            h = subprocess.run(['curl', '-fsS', '--max-time', '3', 'http://127.0.0.1:3101/api/health'], capture_output=True)
            if h.returncode == 0 and json.loads(h.stdout).get('ok'): break
        else: raise RuntimeError('New service did not become healthy')
        api = run_node(auth + "const c=await get('/api/strategy/catalog?country=US,NO');if(!c.inputOptions||c.scope.country!=='NO,US'||c.discovery?.version!=='research-discovery-1.0')throw Error('classified catalog failed');const ids=c.discovery.opportunities.flatMap(x=>x.actions);if(ids.length!==c.recommendations.length||new Set(ids).size!==ids.length||c.discovery.directions.reduce((n,x)=>n+x.opportunities,0)!==c.discovery.counts.opportunities||c.templates.some(t=>!t.classification||!t.taskType||t.canExecute))throw Error('discovery invariants failed');for(const file of ['scope-state.js','scope-fields.js','guided-inputs.js','discovery.js']){const r=await fetch('http://127.0.0.1:3101/strategy/'+file,{headers:{Cookie:'ocean_auth='+cookie}});if(!r.ok)throw Error('module missing');}console.log(JSON.stringify({countries:c.filterOptions.countries.length,sources:c.filterOptions.sources.length,series:c.series.length,discoveryVersion:c.discovery.version,opportunities:c.discovery.counts.opportunities,methodEntries:c.recommendations.length,themes:c.templates.length}));", release)
        after, db_after = snapshot_summary(), run_node(db_probe, release)
        if before != after or db_before != db_after or any(sha(study_dir / name) != digest for name, digest in originals.items()):
            raise RuntimeError('Business-data preservation check failed')
        report = {'status': 'deployed', 'release': str(release), 'previousRelease': str(old), 'files': len(protected), 'databaseMigration': False, 'dataPreserved': True, 'snapshot': after, 'api': api, 'baselineFailures': baseline_failures, 'preservedProductionChanges': manifest.get('preservedProductionChanges', [])}
        (backup / 'deployment.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report))
    except BaseException:
        pending.unlink(missing_ok=True)
        pending.symlink_to(old)
        os.replace(pending, base / 'current')
        subprocess.run(['pm2', 'restart', 'ocean-intelligence'], stdout=subprocess.DEVNULL)
        raise
