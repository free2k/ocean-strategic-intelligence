"""Run on production; credentials are read from a protected file, never logged."""
import datetime, fcntl, json, os, pathlib, re, shutil, subprocess, sys, time, urllib.request

BASE = pathlib.Path('/opt/knowledge-base')
NAMES = ('knowledge-base', 'ocean-intelligence')
FIELDS = ('OPENAI_API_KEY', 'OPENAI_BASE_URL', 'NUXT_OPENAI_API_KEY', 'NUXT_OPENAI_BASE_URL')

def run(args, env=None):
    p = subprocess.run(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode:
        raise RuntimeError('Command failed: ' + args[0])
    return p.stdout

def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)
        if m:
            values[m[1]] = m[2].strip().strip('\"\'')
    return values

def write_values(path, values):
    body = path.read_text()
    for key, value in values.items():
        assert '\n' not in value and "'" not in value
        line = key + "='" + value + "'"
        pattern = r'(?m)^\s*(?:export\s+)?' + key + r'=.*$'
        body = re.sub(pattern, lambda _: line, body) if re.search(pattern, body) else body.rstrip() + '\n' + line + '\n'
    tmp = path.with_name(path.name + '.switch-tmp')
    tmp.write_text(body)
    tmp.chmod(0o600)
    tmp.replace(path)

def restart(values):
    for name in NAMES:
        env = dict(os.environ, **values[name])
        run(['pm2', 'restart', name, '--update-env'], env)

def rollback(folder):
    meta = json.loads((folder / 'restore.json').read_text())
    for item in meta['files']:
        shutil.copy2(folder / item['backup'], item['path'])
    restart(meta['processes'])
    run(['pm2', 'save'])
    print('Previous model configuration restored', flush=True)

if len(sys.argv) == 3 and sys.argv[1] == '--rollback':
    rollback(pathlib.Path(sys.argv[2]))
    sys.exit(0)

os.umask(0o077)
credential = BASE / '.data/new-model-config.json'
new = json.loads(credential.read_text())
values = dict(zip(FIELDS, (new['key'], new['url'], new['key'], new['url'])))
old_env = read_env(BASE / '.env')
test_env = {**os.environ, **old_env, **values}
print('Testing new account before changing production', flush=True)
print(run(['node', str(BASE / 'scripts/check-new-model-account.mjs')], test_env), flush=True)

folder = BASE / ('model-account-backup-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S'))
folder.mkdir(mode=0o700)
apps = json.loads(run(['pm2', 'jlist']))
(folder / 'pm2-processes.json').write_text(json.dumps(apps))
meta = {'files': [], 'processes': {}}
for path in (BASE / '.env', BASE / 'mp2rss.env', pathlib.Path('/opt/ocean-intelligence/eia.env')):
    if not path.exists():
        continue
    saved = str(len(meta['files'])) + '.env'
    shutil.copy2(path, folder / saved)
    (folder / saved).chmod(0o600)
    meta['files'].append({'path': str(path), 'backup': saved})
for name in NAMES:
    app = next(a for a in apps if a['name'] == name)
    effective = {**old_env, **app['pm2_env']}
    meta['processes'][name] = {
        'OPENAI_API_KEY': effective.get('OPENAI_API_KEY', old_env['OPENAI_API_KEY']),
        'OPENAI_BASE_URL': effective.get('OPENAI_BASE_URL', old_env['OPENAI_BASE_URL']),
        'NUXT_OPENAI_API_KEY': effective.get('NUXT_OPENAI_API_KEY', effective.get('OPENAI_API_KEY', old_env['OPENAI_API_KEY'])),
        'NUXT_OPENAI_BASE_URL': effective.get('NUXT_OPENAI_BASE_URL', effective.get('OPENAI_BASE_URL', old_env['OPENAI_BASE_URL'])),
    }
(folder / 'restore.json').write_text(json.dumps(meta))
shutil.copy2(__file__, folder / 'switch-model-account.py')
print('Backup: ' + str(folder), flush=True)
lock = open('/opt/ocean-intelligence/eia-daily.lock', 'a')
for attempt in range(120):
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if attempt == 119:
            raise RuntimeError('Maintenance lock remained busy; no configuration change made')
        if attempt % 4 == 0:
            print('Waiting for current maintenance operation to release its lock', flush=True)
        time.sleep(10)
state = json.loads(pathlib.Path('/opt/ocean-intelligence/data/collection-status.json').read_text())
if state.get('running'):
    raise RuntimeError('Intelligence job is active; no production change made')
timer_was_active = subprocess.run(['systemctl', 'is-active', '--quiet', 'mp2rss-sync.timer']).returncode == 0
changed = False
try:
    if timer_was_active:
        run(['systemctl', 'stop', 'mp2rss-sync.timer'])
    changed = True
    write_values(BASE / '.env', values)
    for item in meta['files'][1:]:
        path = pathlib.Path(item['path'])
        present = read_env(path)
        overrides = {k: v for k, v in values.items() if k in present}
        if overrides:
            write_values(path, overrides)
    restart({name: values for name in NAMES})
    for port, route in ((3000, '/'), (3101, '/api/health')):
        for attempt in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:' + str(port) + route, timeout=5) as r:
                    assert r.status == 200
                break
            except Exception:
                if attempt == 29:
                    raise RuntimeError('Service health check failed')
                time.sleep(1)
        print('Service healthy: ' + str(port), flush=True)
    apps = json.loads(run(['pm2', 'jlist']))
    for name in NAMES:
        app = next(a for a in apps if a['name'] == name)
        actual = dict(x.split('=', 1) for x in pathlib.Path('/proc/' + str(app['pid']) + '/environ').read_bytes().decode().split('\0') if '=' in x)
        assert all(actual.get(k) == v for k, v in values.items()), 'Runtime configuration mismatch'
        assert app['pm2_env']['status'] == 'online'
        print(name + ': new key and endpoint verified in live process', flush=True)
    run(['pm2', 'save'])
    print('SWITCH_SUCCESS', flush=True)
except Exception:
    if changed:
        rollback(folder)
    raise
finally:
    credential.unlink(missing_ok=True)
    if timer_was_active:
        run(['systemctl', 'start', 'mp2rss-sync.timer'])
