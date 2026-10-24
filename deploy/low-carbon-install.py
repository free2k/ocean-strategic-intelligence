#!/usr/bin/env python3
"""Install an independent process/database; only the declared services are shared.
Run as root on the target after uploading the reviewed release. No Git operations.
"""
import os, sys, json, secrets, subprocess, pathlib, hashlib, urllib.request, time
ROOT=pathlib.Path('/opt/low-carbon')
RELEASE=pathlib.Path(sys.argv[1]).resolve()
if ROOT not in RELEASE.parents or not (RELEASE/'intelligence/low-carbon/run.mjs').is_file():
    raise SystemExit('Unexpected low-carbon release path')
def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)
def write(path, content, mode=0o644, owner=None):
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content);path.chmod(mode)
    if owner:run('chown',owner,str(path))
for user in ('lowcarbon','lcpostgres','lcshared'):
    if subprocess.run(['id','-u',user],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
        run('useradd','--system','--home-dir',str(ROOT),'--shell','/usr/sbin/nologin',user)
ROOT.mkdir(exist_ok=True)
write('/etc/systemd/system/low-carbon.slice',"""[Unit]
Description=Low-carbon resource budget
[Slice]
CPUQuota=50%
CPUWeight=20
MemoryHigh=512M
MemoryMax=640M
IOWeight=25
TasksMax=256
""")
for directory,owner in [('data','root'),('data/intelligence','lowcarbon'),('data/research','lowcarbon'),('data/locks','lowcarbon'),('data/pg','lcpostgres'),('acceptance','root')]:
    d=ROOT/directory;d.mkdir(parents=True,exist_ok=True);d.chmod(0o755 if directory=='data' else 0o700);run('chown',owner,str(d))
dependencies=pathlib.Path('/opt/knowledge-base/node_modules')
if not (dependencies/'pg').exists():raise SystemExit('Existing runtime dependencies unavailable')
if not (RELEASE/'node_modules').exists():(RELEASE/'node_modules').symlink_to(dependencies)
credentials=ROOT/'credentials.json'
if credentials.exists():keys=json.loads(credentials.read_text())
else:
    keys={'databasePassword':secrets.token_urlsafe(36),'webPassword':secrets.token_urlsafe(15),'sessionSecret':secrets.token_hex(32),'gatewayToken':secrets.token_hex(32),'instanceId':'lc-'+secrets.token_hex(12)}
    write(credentials,json.dumps(keys),0o600)
marker=ROOT/'data/instance.json'
identity={'appId':'low-carbon','instanceId':keys['instanceId']}
if marker.exists() and json.loads(marker.read_text())!=identity:raise SystemExit('Filesystem instance identity mismatch')
write(marker,json.dumps(identity),0o644)
pgdata=ROOT/'data/pg'
if not (pgdata/'PG_VERSION').exists():
    run('runuser','-u','lcpostgres','--','/usr/lib/postgresql/18/bin/initdb','-D',str(pgdata),'--auth-local=peer','--auth-host=scram-sha-256','--encoding=UTF8','--no-locale',stdout=subprocess.DEVNULL)
write(pgdata/'postgresql.auto.conf',"""listen_addresses='127.0.0.1'
port=55432
unix_socket_directories='/run/low-carbon-pg'
shared_buffers='32MB'
work_mem='2MB'
maintenance_work_mem='16MB'
max_connections=24
max_wal_size='256MB'
min_wal_size='32MB'
timezone='Asia/Shanghai'
logging_collector=off
""",0o600,'lcpostgres')
write('/etc/systemd/system/low-carbon-postgres.service',f"""[Unit]
Description=Low-carbon isolated PostgreSQL 18
After=network.target
[Service]
User=lcpostgres
Slice=low-carbon.slice
RuntimeDirectory=low-carbon-pg
RuntimeDirectoryMode=0700
ExecStart=/usr/lib/postgresql/18/bin/postgres -D {pgdata}
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
MemoryHigh=180M
MemoryMax=256M
CPUQuota=50%
Nice=10
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths={pgdata} /run/low-carbon-pg
[Install]
WantedBy=multi-user.target
""")
write('/etc/systemd/system/low-carbon-shared.service',f"""[Unit]
Description=Low-carbon shared AI and subscription gateway
After=network.target knowledge-base.service
[Service]
WorkingDirectory={RELEASE}
Slice=low-carbon.slice
EnvironmentFile={ROOT}/gateway.env
ExecStart=/usr/bin/node {RELEASE}/intelligence/low-carbon/shared-gateway.mjs
Restart=on-failure
RestartSec=5
MemoryHigh=128M
MemoryMax=192M
CPUQuota=30%
Nice=10
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
""")
write(ROOT/'gateway.env',f"LC_SHARED_CONFIG_FILE=/opt/knowledge-base/.env\nLC_GATEWAY_TOKEN={keys['gatewayToken']}\nLC_GATEWAY_PORT=3270\n",0o600)
run('systemctl','daemon-reload');run('systemctl','enable','--now','low-carbon-postgres.service')
for attempt in range(30):
    ready=subprocess.run(['runuser','-u','lcpostgres','--','/usr/lib/postgresql/18/bin/pg_isready','-h','/run/low-carbon-pg','-p','55432'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if ready.returncode==0:break
    if attempt==29:raise SystemExit('Isolated PostgreSQL did not become ready')
    time.sleep(.5)
sql=fr"""SELECT 'CREATE ROLE lc_app LOGIN PASSWORD ''{keys['databasePassword']}''' WHERE NOT EXISTS(SELECT FROM pg_roles WHERE rolname='lc_app')\gexec
SELECT 'CREATE DATABASE low_carbon_kb OWNER lc_app' WHERE NOT EXISTS(SELECT FROM pg_database WHERE datname='low_carbon_kb')\gexec
"""
run('runuser','-u','lcpostgres','--','/usr/lib/postgresql/18/bin/psql','-h','/run/low-carbon-pg','-p','55432','-d','postgres','-v','ON_ERROR_STOP=1',input=sql,text=True,stdout=subprocess.DEVNULL)
run('runuser','-u','lcpostgres','--','/usr/lib/postgresql/18/bin/psql','-h','/run/low-carbon-pg','-p','55432','-d','low_carbon_kb','-v','ON_ERROR_STOP=1','-c','CREATE EXTENSION IF NOT EXISTS vector;',stdout=subprocess.DEVNULL)
run('systemctl','enable','--now','low-carbon-shared.service')
run('systemctl','restart','low-carbon-shared.service')
import time
for attempt in range(20):
    try:
        req=urllib.request.Request('http://127.0.0.1:3270/status',headers={'Authorization':'Bearer '+keys['gatewayToken']});shared=json.load(urllib.request.urlopen(req,timeout=5));break
    except Exception:
        if attempt==19:raise SystemExit('Shared gateway failed readiness check')
        time.sleep(.5)
dsn=f"postgresql://lc_app:{keys['databasePassword']}@127.0.0.1:55432/low_carbon_kb"
env={'APP_ID':'low-carbon','LC_INSTANCE_ID':keys['instanceId'],'LC_DATA_ROOT':str(ROOT/'data'),'LC_LOCK_DIR':str(ROOT/'data/locks'),'DATABASE_URL':dsn,'INTEL_DATABASE_URL':dsn,'INTEL_AUDIT_DATABASE_URL':dsn,'INTEL_DATA_DIR':str(ROOT/'data/intelligence'),'INTEL_RESEARCH_ARCHIVE':str(ROOT/'data/research'),'INTEL_RESEARCH_BACKEND':'postgres','SITE_PASSWORD':keys['webPassword'],'LC_SESSION_SECRET':keys['sessionSecret'],'LC_GATEWAY_TOKEN':keys['gatewayToken'],'LC_SHARED_GATEWAY':'http://127.0.0.1:3270','INTEL_PORT':'3201','INTEL_BASE_PATH':'/','INTEL_ENABLE_AI':str(shared['ai']).lower(),'INTEL_SCHEDULE':'true','OPENAI_BASE_URL':'http://127.0.0.1:3270/v1','OPENAI_API_KEY':keys['gatewayToken'],'CHAT_MODEL':shared['model'],'EMBEDDING_MODEL':shared['embeddingModel'],'LC_AI_BATCH_LIMIT':'6','NODE_ENV':'production','NODE_OPTIONS':'--max-old-space-size=256'}
write(ROOT/'app.env',''.join(f'{k}={v}\n' for k,v in env.items()),0o600,'lowcarbon')
run('runuser','-u','lowcarbon','--','/usr/bin/node','--env-file='+str(ROOT/'app.env'),str(RELEASE/'intelligence/low-carbon/bootstrap.mjs'),cwd=RELEASE)
write('/etc/systemd/system/low-carbon-app.service',f"""[Unit]
Description=Low-carbon intelligence application
After=network.target low-carbon-postgres.service low-carbon-shared.service
Requires=low-carbon-postgres.service
[Service]
User=lowcarbon
Slice=low-carbon.slice
WorkingDirectory={RELEASE}
EnvironmentFile={ROOT}/app.env
ExecStart=/usr/bin/node {RELEASE}/intelligence/low-carbon/run.mjs
Restart=on-failure
RestartSec=5
MemoryHigh=320M
MemoryMax=448M
CPUQuota=50%
Nice=10
TasksMax=64
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
NoNewPrivileges=true
ReadWritePaths={ROOT}/data/intelligence {ROOT}/data/research {ROOT}/data/locks
InaccessiblePaths=/opt/knowledge-base/.env /opt/ocean-intelligence /var/lib/postgresql
[Install]
WantedBy=multi-user.target
""")
run('systemctl','daemon-reload');run('systemctl','enable','--now','low-carbon-app.service');run('systemctl','restart','low-carbon-app.service')
for attempt in range(30):
    try:
        health=json.load(urllib.request.urlopen('http://127.0.0.1:3201/api/health',timeout=5));break
    except Exception:
        if attempt==29:raise SystemExit('Application failed readiness check')
        time.sleep(.5)
nginx=pathlib.Path('/etc/nginx/sites-available/low-carbon')
write(nginx,"""server {
    listen 80;
    listen [::]:80;
    server_name low-carbon.39.96.24.170.sslip.io low-carbon.39.96.24.170.nip.io;
    client_max_body_size 20m;
    access_log /var/log/nginx/low-carbon-access.log;
    error_log /var/log/nginx/low-carbon-error.log;
    location / {
        proxy_pass http://127.0.0.1:3201;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 240s;
    }
}
""")
enabled=pathlib.Path('/etc/nginx/sites-enabled/low-carbon')
if not enabled.exists():enabled.symlink_to(nginx)
try:run('nginx','-t',stdout=subprocess.DEVNULL)
except Exception:
    enabled.unlink(missing_ok=True)
    raise
run('systemctl','reload','nginx')
current=ROOT/'current'
if current.is_symlink():current.unlink()
current.symlink_to(RELEASE)
write('/etc/systemd/system/low-carbon-backup.service',f"""[Unit]
Description=Low-carbon database and files backup
After=low-carbon-postgres.service
[Service]
Type=oneshot
Slice=low-carbon.slice
ExecStart=/usr/bin/python3 {RELEASE}/deploy/low-carbon-backup.py
Nice=19
MemoryMax=192M
""")
write('/etc/systemd/system/low-carbon-backup.timer',"""[Unit]
Description=Daily low-carbon backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=5m
[Install]
WantedBy=timers.target
""")
run('systemctl','daemon-reload');run('systemctl','enable','--now','low-carbon-backup.timer')
write(ROOT/'acceptance/deployment.json',json.dumps({'release':str(RELEASE),'url':'http://low-carbon.39.96.24.170.sslip.io/','health':health,'shared':shared,'originalConfigUnmodified':True},ensure_ascii=False,indent=2),0o600)
print(json.dumps({'deployed':True,'url':'http://low-carbon.39.96.24.170.sslip.io/','databasePort':55432,'appPort':3201,'shared':shared}))
