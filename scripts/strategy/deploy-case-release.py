#!/usr/bin/env python3
"""Apply a bounded program archive while retaining the current site's other files."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request

incoming = Path(sys.argv[1]).resolve()
if incoming.parent != Path('/tmp') or not incoming.name.startswith('ocean-ccus-case-'):
    raise RuntimeError('Unexpected staging directory')
manifest = json.loads((incoming / 'manifest.json').read_text())
base = Path('/opt/ocean-intelligence')
guard = (base / 'ui-publish.lock').open('a'); fcntl.flock(guard, fcntl.LOCK_EX)
eia_guard = (base / 'eia-daily.lock').open('a')
deadline = time.monotonic() + 50
while True:
    try:
        fcntl.flock(eia_guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if time.monotonic() >= deadline:
            raise RuntimeError('Background processing still active; live service untouched') from None
        time.sleep(.1)
previous = (base / 'current').resolve()
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
release = base / 'releases' / ('ccus-case-' + stamp)
backup = base / 'backups' / ('ccus-case-' + stamp)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None


def check_baseline():
    if str((base / 'current').resolve()) != manifest['baseRelease']:
        raise RuntimeError('Live release changed; rebuild the patch manifest')
    for item in manifest['files']:
        if sha(previous / item['path']) != item['before']:
            raise RuntimeError('Concurrent live edit: ' + item['path'])


check_baseline()
shutil.copytree(previous, release, symlinks=True, ignore=shutil.ignore_patterns('node_modules', '.git', 'seed'))
(release / 'node_modules').symlink_to('/opt/knowledge-base/node_modules')
allowed = {item['path'] for item in manifest['files']}
with tarfile.open(incoming / 'program.tar.gz') as archive:
    for member in archive.getmembers():
        if member.name not in allowed or not member.isfile() or not (release / member.name).resolve().is_relative_to(release):
            raise RuntimeError('Unsafe archive member')
        target = release / member.name; target.parent.mkdir(parents=True, exist_ok=True)
        with archive.extractfile(member) as src, target.open('wb') as dst: shutil.copyfileobj(src, dst)
for item in manifest['files']:
    p = release / item['path']
    if sha(p) != item['after']: raise RuntimeError('Checksum failed')
    if p.suffix in ['.js', '.mjs']: subprocess.run(['node', '--check', str(p)], check=True, capture_output=True)
backup.mkdir(parents=True)
tests = ['strategy-review-fixes', 'evaluation-case', 'strategy-cases', 'strategy-discovery', 'strategy-engine', 'strategy-workbench', 'strategy-advisor', 'strategy-guided-inputs', 'strategy-scope', 'workspace-data', 'workspace-data-server', 'navigation-cache']
with (backup / 'tests.log').open('w') as output:
    result = subprocess.run(['node', '--test', *['intelligence/tests/' + t + '.test.mjs' for t in tests]], cwd=release, stdout=output, stderr=subprocess.STDOUT, timeout=120)
if result.returncode:
    raise RuntimeError('Staged checks failed: ' + str(backup / 'tests.log'))

code = "const c=require('node:crypto');const e=String(Date.now()+600000);process.stdout.write(e+'.'+c.createHmac('sha256',process.env.SITE_PASSWORD).update(e).digest('hex'))"
token = subprocess.check_output(['node', '--env-file=/opt/knowledge-base/.env', '-e', code], text=True).strip()


def api(route):
    req = urllib.request.Request('http://127.0.0.1:3101/api/' + route, headers={'Cookie': 'ocean_auth=' + token})
    with urllib.request.urlopen(req, timeout=45) as response: return json.load(response)


def switch(target):
    temp = base / 'current-case-next'; temp.unlink(missing_ok=True); temp.symlink_to(target); os.replace(temp, base / 'current')


collection, reports = api('collection'), api('period-reports')
if collection.get('running') or any(r.get('status') in ['queued', 'running'] for r in reports.get('items', [])):
    raise RuntimeError('Background work is active; staged release retained, live service untouched')
check_baseline()
(backup / 'previous-release.txt').write_text(str(previous))
switch(release)
try:
    subprocess.run(['pm2', 'restart', 'ocean-intelligence'], check=True, capture_output=True)
    for attempt in range(40):
        try:
            if api('health').get('ok'): break
        except Exception: pass
        time.sleep(.5)
    else: raise RuntimeError('Health check failed')
    catalog = api('strategy/catalog?topic=' + urllib.parse.quote('海洋低碳'))
    if 'caseStudies' not in catalog: raise RuntimeError('New catalogue unavailable')
    (backup / 'deployment.json').write_text(json.dumps({'release': str(release), 'previous': str(previous), 'manifest': manifest, 'checks': 'passed'}, indent=2))
    print(json.dumps({'deployed': True, 'release': str(release), 'backup': str(backup), 'tests': 'passed'}))
except Exception:
    switch(previous)
    subprocess.run(['pm2', 'restart', 'ocean-intelligence'], capture_output=True)
    raise
