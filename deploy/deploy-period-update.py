"""Deploy a committed code/build bundle and merge prepared reports, with rollback.

Usage (on server): python3 deploy-period-update.py /tmp/period-update.tar.gz
Bundle contains code/, output/, period-runtime.json and revision.txt.
"""
import datetime, fcntl, hashlib, hmac, json, os, pathlib, shutil, subprocess, sys, tarfile, time, urllib.request

root = pathlib.Path('/opt/ocean-intelligence')
base = pathlib.Path('/opt/knowledge-base')
lock = open(root / 'ui-publish.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = root / 'backups' / ('period-' + stamp)
backup.mkdir(parents=True)
stage = backup / 'stage'
stage.mkdir()
with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        if not (stage / member.name).resolve().is_relative_to(stage) or member.issym() or member.islnk():
            raise RuntimeError('Unsafe bundle member')
    archive.extractall(stage)
revision = (stage / 'revision.txt').read_text().strip()
assert (stage / 'output/server/index.mjs').is_file()
incoming = json.loads((stage / 'period-runtime.json').read_text())['periodReports']
assert any(j['status'] == 'published' and len(j['domains']) == 6 and all(d['status'] == 'ready' for d in j['domains']) for j in incoming.values())
previous = (root / 'current').resolve()
release = root / 'releases' / stamp
shutil.copytree(previous, release, symlinks=True, ignore=shutil.ignore_patterns('node_modules', '.git'))
(release / 'node_modules').symlink_to(base / 'node_modules')
shutil.copytree(stage / 'code/intelligence', release / 'intelligence', dirs_exist_ok=True)
(release / 'release-manifest.json').write_text(json.dumps({'sourceRevision': revision, 'publishedAt': stamp}))

def run(args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, text=True)

run(['node', '--check', str(release / 'intelligence/server.mjs')])
config = {}
for line in (base / '.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        config[k] = v.strip().strip('"').strip("'")
expiry = str(int(time.time() * 1000) + 600000)
token = expiry + '.' + hmac.new(config['SITE_PASSWORD'].encode(), expiry.encode(), hashlib.sha256).hexdigest()

def api(port, route):
    request = urllib.request.Request(f'http://127.0.0.1:{port}{route}', headers={'Cookie': 'ocean_auth=' + token + '; site_auth=' + token})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def switch(target):
    temp = root / 'current-period-next'
    temp.unlink(missing_ok=True)
    temp.symlink_to(target)
    os.replace(temp, root / 'current')

statefile = root / 'data/period-reports/runtime.json'
state_existed = statefile.exists()
sources = []
output_swapped = False
state_changed = False
try:
    run(['pm2', 'stop', 'ocean-intelligence'])
    statefile.parent.mkdir(parents=True, exist_ok=True)
    if (statefile.parent / 'runtime.lock').exists():
        raise RuntimeError('Period state is locked; refusing overwrite')
    state = json.loads(statefile.read_text()) if state_existed else {'tasks': {}, 'reservations': {}, 'days': {}, 'budget': None}
    if any(j['status'] in ['queued', 'running'] for j in state.get('periodReports', {}).values()):
        raise RuntimeError('Active report generation; deployment deferred')
    if state_existed:
        shutil.copy2(statefile, backup / 'period-runtime-before.json')
    jobs = state.setdefault('periodReports', {})
    for key, job in incoming.items():
        if key in jobs and jobs[key] != job:
            raise RuntimeError('Existing report ID has different content')
        jobs[key] = job
    temp = statefile.with_suffix('.deploy-tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False))
    temp.chmod(0o600)
    os.replace(temp, statefile)
    state_changed = True
    run(['pm2', 'stop', 'knowledge-base'])
    (base / '.output').rename(backup / 'output-before')
    output_swapped = True
    shutil.copytree(stage / 'output', base / '.output')
    for source in (stage / 'code').rglob('*'):
        if not source.is_file():
            continue
        rel = source.relative_to(stage / 'code')
        dest = base / rel
        saved = backup / 'source-before' / rel
        existed = dest.exists()
        if existed:
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, saved)
        sources.append((dest, saved, existed))
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    switch(release)
    run(['pm2', 'restart', 'knowledge-base'])
    run(['pm2', 'restart', 'ocean-intelligence'])
    for attempt in range(40):
        try:
            assert api(3101, '/api/health')['ok']
            reports = api(3101, '/api/period-reports')['items']
            assert all(any(j['id'] == key for j in reports) for key in incoming)
            break
        except Exception:
            if attempt == 39:
                raise
            time.sleep(0.5)
    completed = next(j for j in incoming.values() if all(d['status'] == 'ready' for d in j['domains']))
    monitor = api(3101, '/api/monitor-period?periodReportId=' + completed['id'])
    assert monitor['total'] == len(completed['documents'])
    stats = api(3000, '/api/stats')
    assert stats['totalArticles'] > 0
    run(['pm2', 'save'])
    result = {'revision': revision, 'release': str(release), 'previous': str(previous), 'backup': str(backup), 'reportId': completed['id'], 'reportDocuments': len(completed['documents']), 'monitor': monitor, 'stats': stats}
    (backup / 'result.json').write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps({k: v for k, v in result.items() if k not in ['monitor', 'stats']}))
except Exception:
    run(['pm2', 'stop', 'ocean-intelligence'])
    run(['pm2', 'stop', 'knowledge-base'])
    switch(previous)
    if output_swapped:
        if (base / '.output').exists():
            (base / '.output').rename(backup / 'output-failed')
        (backup / 'output-before').rename(base / '.output')
    for dest, saved, existed in reversed(sources):
        if existed:
            shutil.copy2(saved, dest)
        else:
            dest.unlink(missing_ok=True)
    if state_changed:
        if state_existed:
            shutil.copy2(backup / 'period-runtime-before.json', statefile)
        else:
            statefile.unlink(missing_ok=True)
    run(['pm2', 'restart', 'knowledge-base'])
    run(['pm2', 'restart', 'ocean-intelligence'])
    raise
