#!/usr/bin/env python3
"""Run on the authorized host with a staging directory argument.

Installs only the static preview and its isolated Nginx location. Backs up all
replaced files, tests config before reload, and restores on verification failure.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe(route):
    req = urllib.request.Request('http://127.0.0.1' + route,
                                 headers={'Host': '49.233.77.111'})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as res:
            return res.status, res.read(), res.headers.get('Location')
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), exc.headers.get('Location')


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True)


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    temp = path.with_name(path.name + '.haijian-tmp')
    temp.write_bytes(data)
    os.chmod(temp, 0o644)
    os.replace(temp, path)


def main():
    staging = Path(sys.argv[1]).resolve()
    if staging.parent != Path('/tmp') or not staging.name.startswith('haijian-preview-'):
        raise RuntimeError('Unexpected staging directory')
    source = staging / 'index.html'
    snippet_source = staging / 'haijian-preview-location.conf'
    html = source.read_bytes()
    if b'id="qaForm"' not in html or b'id="themeToggle"' not in html:
        raise RuntimeError('Wrong or incomplete preview artifact')
    target = Path('/var/www/haijian-preview/index.html')
    snippet = Path('/etc/nginx/haijian-preview/location.conf')
    main_conf = Path('/etc/nginx/conf.d/knowledge-base.conf')
    include = '    include /etc/nginx/haijian-preview/location.conf;'
    original = main_conf.read_text()
    if include in original:
        updated = original
    else:
        if '/haijian-preview' in original or original.count('    location / {') != 1:
            raise RuntimeError('Nginx configuration needs manual inspection')
        updated = original.replace('    location / {', include + '\n\n    location / {', 1)
    run('nginx', '-t')
    routes = ['/', '/api/auth/check', '/demo-dashboard/', '/live-dashboard/']
    baseline = {route: (probe(route)[0], probe(route)[2]) for route in routes}
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = Path('/var/backups/haijian-preview') / timestamp
    backup.mkdir(parents=True, mode=0o700)
    files = [target, snippet, main_conf]
    originals = {path: path.read_bytes() if path.exists() else None for path in files}
    for path, content in originals.items():
        if content is not None:
            (backup / path.name).write_bytes(content)
    (backup / 'manifest.json').write_text(json.dumps({
        'files': {str(p): p.name if content is not None else None for p, content in originals.items()},
        'baseline': baseline,
        'artifact_sha256': hashlib.sha256(html).hexdigest(),
    }, indent=2))
    reloaded = False
    try:
        atomic_write(target, html)
        atomic_write(snippet, snippet_source.read_bytes())
        atomic_write(main_conf, updated.encode())
        validation = run('nginx', '-t')
        print(validation.stderr.strip())
        run('systemctl', 'reload', 'nginx')
        reloaded = True
        # Nginx reload is graceful: old workers can answer briefly while the
        # new configuration is being activated. Verify after that handover.
        for attempt in range(20):
            code, body, _ = probe('/haijian-preview/')
            if code == 200 and body == html:
                break
            time.sleep(0.25)
        if code != 200 or body != html:
            raise RuntimeError('Preview response or artifact hash mismatch; HTTP ' + str(code))
        after = {route: (probe(route)[0], probe(route)[2]) for route in routes}
        if after != baseline:
            raise RuntimeError('Existing service status or redirect changed: ' + repr(after))
        if probe('/haijian-preview/not-found')[0] != 404:
            raise RuntimeError('Static location fallback is not isolated')
        print(json.dumps({'status': 'deployed', 'url': 'http://49.233.77.111/haijian-preview/',
                          'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body),
                          'backup': str(backup), 'existing_routes': after}, indent=2))
    except Exception:
        for path, content in originals.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content)
        run('nginx', '-t')
        if reloaded:
            run('systemctl', 'reload', 'nginx')
        print('Deployment rolled back; originals restored.', file=sys.stderr)
        raise


if __name__ == '__main__':
    main()
