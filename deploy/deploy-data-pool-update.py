"""Publish the same data-pool feature to both research systems, preserving live code.

Run on the server: python3 deploy-data-pool-update.py BUNDLE --stage-only
Then: python3 deploy-data-pool-update.py BUNDLE --publish
The bundle contains manifest.json and ocean/ + low-carbon/ program overlays.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import time
import urllib.request

P = pathlib.Path
parser = argparse.ArgumentParser()
parser.add_argument('bundle', type=P)
parser.add_argument('--stage-only', action='store_true')
parser.add_argument('--publish', action='store_true')
args = parser.parse_args()
bundle = args.bundle.resolve()
manifest = json.loads((bundle / 'manifest.json').read_text())
roots = {'ocean': P('/opt/ocean-intelligence/current').resolve(),
         'low-carbon': P('/opt/low-carbon/current').resolve()}
stage = bundle / 'checked'
node = '/usr/bin/node-20'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None


def run(*command, **kwargs):
    return subprocess.run(command, check=True, capture_output=True, text=True,
                          timeout=60, **kwargs).stdout


def verify_inputs():
    for system, files in manifest['systems'].items():
        if system not in roots:
            raise RuntimeError('Unexpected system')
        for name, item in files.items():
            rel = P(name)
            if rel.is_absolute() or '..' in rel.parts or rel.parts[0] != 'intelligence':
                raise RuntimeError('Unsafe program path')
            if sha(roots[system] / rel) != item['before']:
                raise RuntimeError('Production program changed: ' + system + '/' + name)
            if sha(bundle / system / rel) != item['after']:
                raise RuntimeError('Bundle checksum mismatch')


def healthy(system):
    try:
        with urllib.request.urlopen('http://127.0.0.1:' + ('3101' if system == 'ocean' else '3201') + '/api/health', timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


def restart(system):
    run('pm2', 'restart', 'ocean-intelligence') if system == 'ocean' else run('systemctl', 'restart', 'low-carbon-app.service')
    until = time.monotonic() + 60
    while time.monotonic() < until:
        if healthy(system):
            return
        time.sleep(.5)
    raise RuntimeError('Research frontend health check failed')


def processor_status():
    script = """process.loadEnvFile('/opt/knowledge-base/.env');
const {createHash}=await import('node:crypto');
const token=createHash('sha256').update('processing-worker:'+process.env.SITE_PASSWORD).digest('hex');
const response=await fetch('http://127.0.0.1:3105/status',{headers:{'x-processing-token':token}});
if(!response.ok)throw Error('Processing readiness check failed');
const value=await response.json();console.log(JSON.stringify({running:!!value.running,manualRunning:!!value.manualRunning}));"""
    return json.loads(run(node, '--input-type=module', '-e', script))


def wait_processor():
    until = time.monotonic() + 45
    while time.monotonic() < until:
        try:
            return processor_status()
        except Exception:
            time.sleep(.5)
    raise RuntimeError('Processing service health check failed')


def audit():
    apps = json.loads(run('pm2', 'jlist'))
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'mainPid': next(p['pid'] for p in apps if p['name'] == 'knowledge-base'),
            'config': {f: sha(P(f)) for f in ('/opt/knowledge-base/.env', '/opt/knowledge-base/model-cost.env', '/opt/ocean-intelligence/processing.env')},
            'batch': run('systemctl', 'show', 'model-operations.timer', '-p', 'ActiveEnterTimestampMonotonic')}


verify_inputs()
if args.stage_only:
    stage.mkdir(mode=0o700, exist_ok=True)
    for system, files in manifest['systems'].items():
        candidate = stage / system
        if candidate.exists():
            shutil.rmtree(candidate)
        shutil.copytree(roots[system], candidate, symlinks=True, ignore=shutil.ignore_patterns('.data', '.git'))
        for name in files:
            target = candidate / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(bundle / system / name, target)
            if target.suffix in ('.js', '.mjs'):
                run(node, '--check', str(target))
        pattern = '^(?!low-carbon)' if system == 'ocean' else '.'
        result = subprocess.run([node, '--test', '--test-name-pattern=' + pattern,
                                 'intelligence/tests/insight-import.test.mjs',
                                 *(['intelligence/tests/request-body.test.mjs'] if (candidate / 'intelligence/tests/request-body.test.mjs').exists() else [])],
                                cwd=candidate, capture_output=True, text=True, timeout=60)
        (stage / (system + '-tests.log')).write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError('Staged regression failed: ' + system)
    (stage / 'ready.json').write_text(json.dumps(manifest))
    print(json.dumps({'staged': True, 'systems': list(roots), 'productionChanged': False}))
elif args.publish:
    if json.loads((stage / 'ready.json').read_text()) != manifest:
        raise RuntimeError('Staged checks missing or stale')
    backup = P('/opt/knowledge-base/data-pool-backups') / manifest['release']
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    marker = P('/run/lock/kb-subsystem-deploying')
    changed = []
    processor_stopped = False
    reload_processing = any(name in files for files in manifest['systems'].values() for name in ('intelligence/store.mjs', 'intelligence/data-provenance.mjs', 'intelligence/insight-data.mjs', 'intelligence/insight-import.mjs'))
    projector_timer = False
    active = None
    with P('/run/lock/kb-research-subsystem.lock').open('a') as switch_lock, P('/opt/ocean-intelligence/eia-daily.lock').open('a') as pipeline_lock:
        fcntl.flock(switch_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(pipeline_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        marker.touch()
        try:
            verify_inputs()
            active = next((s for s in roots if healthy(s)), None)
            if not active:
                raise RuntimeError('No healthy research frontend')
            before = audit()
            (backup / 'before.json').write_text(json.dumps(before, indent=2))
            if reload_processing and subprocess.run(['systemctl', 'is-active', '--quiet', 'ocean-processing.service']).returncode == 0:
                if any(processor_status().values()):
                    raise RuntimeError('Existing processing task is active; no program files changed')
                run('systemctl', 'stop', 'ocean-processing.service')
                processor_stopped = True
            projector_timer = subprocess.run(['systemctl', 'is-active', '--quiet', 'low-carbon-projector.timer']).returncode == 0
            if projector_timer:
                run('systemctl', 'stop', 'low-carbon-projector.timer')
            until = time.monotonic() + 45
            while subprocess.run(['systemctl', 'is-active', '--quiet', 'low-carbon-projector.service']).returncode == 0:
                if time.monotonic() >= until:
                    raise RuntimeError('Local projection still running; no program files changed')
                time.sleep(.5)
            for system, files in manifest['systems'].items():
                for name, item in files.items():
                    live, saved = roots[system] / name, backup / system / name
                    if live.is_file():
                        saved.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(live, saved)
                    live.parent.mkdir(parents=True, exist_ok=True)
                    tmp = live.with_name(live.name + '.data-pool-next')
                    shutil.copy2(bundle / system / name, tmp)
                    if live.exists():
                        shutil.copystat(live, tmp)
                    else:
                        tmp.chmod(0o644)
                    os.replace(tmp, live)
                    changed.append((system, name))
            restart(active)
            if processor_stopped:
                run('systemctl', 'start', 'ocean-processing.service')
                processor_stopped = False
                wait_processor()
            after = audit()
            if before['mainPid'] != after['mainPid'] or before['config'] != after['config'] or before['batch'] != after['batch']:
                raise RuntimeError('Unrelated runtime changed')
            result = {'deployed': True, 'systems': list(roots), 'active': active,
                      'health': healthy(active), 'files': len(changed), 'backup': str(backup),
                      'mainAndConfigUnchanged': True, 'processingReloadedWhenIdle': reload_processing}
            (backup / 'deployment.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result))
        except BaseException:
            for system, name in reversed(changed):
                live, saved = roots[system] / name, backup / system / name
                if saved.exists():
                    shutil.copy2(saved, live)
                else:
                    live.unlink(missing_ok=True)
            if changed and active:
                restart(active)
            if changed and reload_processing and not processor_stopped:
                run('systemctl', 'restart', 'ocean-processing.service')
            raise
        finally:
            if processor_stopped:
                run('systemctl', 'start', 'ocean-processing.service')
            if projector_timer:
                run('systemctl', 'start', 'low-carbon-projector.timer')
            marker.unlink(missing_ok=True)
else:
    parser.error('Choose --stage-only or --publish')
