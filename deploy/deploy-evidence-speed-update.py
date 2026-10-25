"""Publish the shared evidence-page performance update to both research systems.

Run on the server: python3 deploy-evidence-speed-update.py BUNDLE --stage-only
Then: python3 deploy-evidence-speed-update.py BUNDLE --publish
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
            if name not in {'intelligence/public/app.js', 'intelligence/server.mjs', 'intelligence/evidence-page-reader.mjs', 'intelligence/evidence-page.mjs', 'intelligence/classification-audit.mjs', 'intelligence/evidence-page-worker.mjs', 'intelligence/tests/evidence-page-reader.test.mjs', 'intelligence/sensing-page.mjs', 'intelligence/sensing-page-reader.mjs', 'intelligence/evidence-page-query.mjs', 'intelligence/tests/evidence-page.test.mjs', 'intelligence/public/classification-current.js', 'intelligence/public/period-reports.js', 'intelligence/public/sensing.js'}:
                raise RuntimeError('Only evidence-page programs may be changed')
            if rel.is_absolute() or '..' in rel.parts or rel.parts[0] != 'intelligence':
                raise RuntimeError('Unsafe program path')
            if sha(roots[system] / rel) != item['before']:
                raise RuntimeError('Production program changed: ' + system + '/' + name)
            if sha(bundle / system / rel) != item['after']:
                raise RuntimeError('Bundle checksum mismatch')
    if manifest.get('nginx'):
        for name, expected in manifest['nginx'].items():
            if name not in ('/etc/nginx/conf.d/knowledge-base.conf', '/etc/nginx/sensing-page-readers.conf') or sha(P(name)) != expected:
                raise RuntimeError('Nginx configuration changed before deployment')


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


def source_ready(system):
    script = """process.loadEnvFile('/opt/knowledge-base/.env');
const {createHmac}=await import('node:crypto'),expiry=String(Date.now()+60000);
const token=expiry+'.'+createHmac('sha256',process.env.SITE_PASSWORD).update(expiry).digest('hex');
const response=await fetch('http://127.0.0.1:PORT/api/sensing-page',{headers:{Cookie:'site_auth='+token}});
const value=await response.json();if(!response.ok||!Array.isArray(value.subscriptions)||!value.sourceView?.version)throw Error('Source page unavailable');
console.log(JSON.stringify({sources:value.subscriptions.length,counts:value.classification}));""".replace('PORT', ('3106' if system == 'ocean' else '3206') if manifest.get('nginx') else ('3101' if system == 'ocean' else '3201'))
    result = json.loads(run(node, '--input-type=module', '-e', script))
    evidence = script[:script.index('const response=')] + '''const base='http://127.0.0.1:EVIDENCE_PORT';
const headers={Cookie:'site_auth='+token};
const [page,period]=await Promise.all(['/api/evidence-page','/api/evidence-period?preset=7'].map(async path=>{const response=await fetch(base+path,{headers});if(!response.ok)throw Error('Evidence page unavailable');return response.json();}));
if(!page.paged||!Array.isArray(page.documents)||page.documents.length>12||!period.preview?.range)throw Error('Evidence payload unavailable');
console.log(JSON.stringify({total:page.counts.total,firstPage:page.documents.length,range:period.preview.range,report:period.current?.id||null}));'''.replace('EVIDENCE_PORT', '3107' if system == 'ocean' else '3207')
    result['evidence'] = json.loads(run(node, '--input-type=module', '-e', evidence))
    return result


def audit():
    apps = json.loads(run('pm2', 'jlist'))
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'mainPid': next(p['pid'] for p in apps if p['name'] == 'knowledge-base'),
            'config': {f: sha(P(f)) for f in ('/opt/knowledge-base/.env', '/opt/knowledge-base/model-cost.env', '/opt/ocean-intelligence/processing.env')},
            'batch': run('systemctl', 'show', 'model-operations.timer', '-p', 'ActiveEnterTimestampMonotonic'),
            'processing': run('systemctl', 'show', 'ocean-processing.service', '-p', 'MainPID', '-p', 'ActiveEnterTimestampMonotonic')}


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
        tests = ['intelligence/tests/sensing-page.test.mjs', 'intelligence/tests/evidence-page.test.mjs', 'intelligence/tests/evidence-page-reader.test.mjs']
        if (candidate / 'intelligence/tests/sensing-page-reader.test.mjs').exists():
            tests.append('intelligence/tests/sensing-page-reader.test.mjs')
        result = subprocess.run([node, '--test', *tests],
                                cwd=candidate, capture_output=True, text=True, timeout=60)
        (stage / (system + '-tests.log')).write_text(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError('Staged regression failed: ' + system)
    (stage / 'ready.json').write_text(json.dumps(manifest))
    print(json.dumps({'staged': True, 'systems': list(roots), 'productionChanged': False}))
elif args.publish:
    if json.loads((stage / 'ready.json').read_text()) != manifest:
        raise RuntimeError('Staged checks missing or stale')
    backup = P('/opt/knowledge-base/evidence-speed-backups') / manifest['release']
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    marker = P('/run/lock/kb-subsystem-deploying')
    changed = []
    nginx_changed = False
    active = None
    restart_required = any(not name.startswith(('intelligence/public/', 'intelligence/tests/')) for files in manifest['systems'].values() for name in files)
    with P('/run/lock/kb-research-subsystem.lock').open('a') as switch_lock:
        fcntl.flock(switch_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        marker.touch()
        try:
            verify_inputs()
            active = next((s for s in roots if healthy(s)), None)
            if not active:
                raise RuntimeError('No healthy research frontend')
            before = audit()
            (backup / 'before.json').write_text(json.dumps(before, indent=2))
            if manifest.get('nginx'):
                for name in manifest['nginx']:
                    source = P(name)
                    if source.exists():
                        saved = backup / source.relative_to('/')
                        saved.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, saved)
                nginx_changed = True
                conf = P('/etc/nginx/conf.d/knowledge-base.conf')
                include = '    include /etc/nginx/sensing-page-readers.conf;'
                original = conf.read_text()
                if include not in original:
                    anchor = '    include /etc/nginx/ocean-intelligence/location.conf;'
                    if original.count(anchor) != 1:
                        raise RuntimeError('Nginx insertion anchor changed')
                    conf.write_text(original.replace(anchor, include + '\n' + anchor))
                shutil.copy2(bundle / 'sensing-page-readers.nginx.conf', '/etc/nginx/sensing-page-readers.conf')
                nginx_changed = True
                run('nginx', '-t')
            for system, files in manifest['systems'].items():
                for name, item in files.items():
                    live, saved = roots[system] / name, backup / system / name
                    if live.is_file():
                        saved.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(live, saved)
                    live.parent.mkdir(parents=True, exist_ok=True)
                    tmp = live.with_name(live.name + '.evidence-speed-next')
                    shutil.copy2(bundle / system / name, tmp)
                    if live.exists():
                        shutil.copystat(live, tmp)
                    else:
                        tmp.chmod(0o644)
                    os.replace(tmp, live)
                    changed.append((system, name))
            if restart_required:
                restart(active)
            source_ready(active)
            if nginx_changed:
                run('systemctl', 'reload', 'nginx')
            after = audit()
            if before['mainPid'] != after['mainPid'] or before['config'] != after['config'] or before['batch'] != after['batch'] or before['processing'] != after['processing']:
                raise RuntimeError('Unrelated runtime changed')
            result = {'deployed': True, 'systems': list(roots), 'active': active,
                      'health': healthy(active), 'files': len(changed), 'backup': str(backup),
                      'mainAndConfigUnchanged': True, 'backgroundWorkersUnchanged': True}
            (backup / 'deployment.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result))
        except BaseException:
            if nginx_changed:
                for name, original_hash in manifest['nginx'].items():
                    target = P(name)
                    saved = backup / target.relative_to('/')
                    if original_hash is None:
                        target.unlink(missing_ok=True)
                    else:
                        shutil.copy2(saved, target)
                run('nginx', '-t')
                run('systemctl', 'reload', 'nginx')
            for system, name in reversed(changed):
                live, saved = roots[system] / name, backup / system / name
                if saved.exists():
                    shutil.copy2(saved, live)
                else:
                    live.unlink(missing_ok=True)
            if changed and active and restart_required:
                restart(active)
            raise
        finally:
            marker.unlink(missing_ok=True)
else:
    parser.error('Choose --stage-only or --publish')
