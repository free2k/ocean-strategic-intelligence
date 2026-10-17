"""Run on the web server: enable response compression for the intelligence site only."""
from pathlib import Path
import shutil,subprocess,datetime
path=Path('/etc/nginx/ocean-intelligence/location.conf')
original=path.read_text()
if 'gzip on;' not in original:
    backup=path.with_name('location.conf.before-compression-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S'))
    shutil.copy2(path,backup)
    updated=original.replace('location /ocean-intelligence/ {','location /ocean-intelligence/ {\n    gzip on;\n    gzip_vary on;\n    gzip_proxied any;\n    gzip_comp_level 4;\n    gzip_min_length 1024;\n    gzip_types application/json text/javascript application/javascript text/css image/svg+xml;')
    if updated==original: raise RuntimeError('Intelligence location not found')
    path.write_text(updated)
    try:
        subprocess.run(['nginx','-t'],check=True)
        subprocess.run(['systemctl','reload','nginx'],check=True)
    except Exception:
        path.write_text(original)
        subprocess.run(['nginx','-t'],check=True)
        subprocess.run(['systemctl','reload','nginx'],check=True)
        raise
    print('Compression enabled; backup',backup)
else:
    print('Compression already configured')
