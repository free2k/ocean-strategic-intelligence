#!/usr/bin/env python3
"""Install the shared, provider-free low-carbon profile without restarting workers."""
import json,os,pathlib,secrets,subprocess,sys,hashlib
root=pathlib.Path('/opt/low-carbon');release=pathlib.Path(sys.argv[1]).resolve()
if root not in release.parents or not (release/'intelligence/low-carbon/shared-projector-run.mjs').is_file():raise SystemExit('Invalid release')
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
def write(file,text,mode=0o600):
 p=pathlib.Path(file);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);p.chmod(mode)
def sql(text,database='postgres'):
 return run('runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-At','-d',database,input=text,text=True,capture_output=True).stdout.strip()
settings={}
for line in pathlib.Path('/opt/knowledge-base/.env').read_text().splitlines():
 if '=' in line and not line.startswith('#'):
  k,v=line.split('=',1);settings[k]=v.strip().strip('\"\'')
password=settings.get('SITE_PASSWORD')
if not password:raise SystemExit('Existing site password required')
keysfile=root/'credentials.json'
if keysfile.exists():keys=json.loads(keysfile.read_text())
else:
 keys={k:secrets.token_hex(24) for k in ['appPassword','readerPassword','instanceId','sessionSecret']};write(keysfile,json.dumps(keys))
for user in ['lowcarbon','lcprojector']:
 if subprocess.run(['id',user],capture_output=True).returncode:run('useradd','--system','--home-dir',str(root),'--shell','/sbin/nologin',user)
run('usermod','-a','-G','lowcarbon','lcprojector')
for role in ['lc_app','lc_source_reader']:
 if sql("SELECT 1 FROM pg_roles WHERE rolname='%s'"%role)!='1':sql('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;')
sql("ALTER ROLE lc_app PASSWORD '%s'; ALTER ROLE lc_source_reader PASSWORD '%s'; ALTER ROLE lc_source_reader SET default_transaction_read_only=on; ALTER ROLE lc_source_reader SET statement_timeout='3s';"%(keys['appPassword'],keys['readerPassword']))
if sql("SELECT 1 FROM pg_database WHERE datname='low_carbon_kb'")!='1':sql('CREATE DATABASE low_carbon_kb OWNER lc_app;')
if sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='low_carbon_kb'")!='lc_app':raise SystemExit('Unexpected database owner')
sql('CREATE EXTENSION IF NOT EXISTS vector;', 'low_carbon_kb')
tables=['public.articles','public.sources','mp2rss.items','mp2rss.subscriptions','mp2rss.evidence_documents','ocean_intel.documents','ocean_intel.sources','ocean_intel.runs','ocean_intel.workspace_rows','ocean_intel.workspace_parts','model_ops.resources']
sql('GRANT CONNECT ON DATABASE knowledge_base TO lc_source_reader; GRANT USAGE ON SCHEMA public,mp2rss,ocean_intel,model_ops TO lc_source_reader; GRANT SELECT ON '+','.join(tables)+' TO lc_source_reader;', 'knowledge_base')
for sub in ['intelligence','research','locks']:
 p=root/'data'/sub;p.mkdir(parents=True,exist_ok=True);run('chown','lowcarbon:lowcarbon',str(p));p.chmod(0o2770)
write(root/'data/instance.json',json.dumps({'appId':'low-carbon','instanceId':keys['instanceId']}),0o644)
env={'APP_ID':'low-carbon','LC_COLLECTION_MODE':'shared','LC_INSTANCE_ID':keys['instanceId'],'LC_DATA_ROOT':str(root/'data'),'LC_LOCK_DIR':str(root/'data/locks'),'INTEL_DATA_DIR':str(root/'data/intelligence'),'INTEL_RESEARCH_ARCHIVE':str(root/'data/research'),'DATABASE_URL':'postgresql://lc_app:'+keys['appPassword']+'@127.0.0.1:5432/low_carbon_kb','INTEL_PORT':'3201','INTEL_BASE_PATH':'/low-carbon/','INTEL_RESEARCH_BACKEND':'postgres','INTEL_ENABLE_AI':'false','INTEL_SCHEDULE':'false','INTEL_BATCH_ENABLED':'false','INTEL_MODEL_WORKER_ENABLED':'false','INTEL_FAST_METADATA':'true','INTEL_PRESERVE_STARTUP_DATA':'true','INTEL_PROCESSING_REMOTE':'true','SITE_PASSWORD':password,'LC_SESSION_SECRET':keys['sessionSecret'],'NODE_ENV':'production'}
env['INTEL_DATABASE_URL']=env['DATABASE_URL'];env['INTEL_AUDIT_DATABASE_URL']=env['DATABASE_URL']
write(root/'app.env',''.join(k+'='+json.dumps(v,ensure_ascii=False)+'\n' for k,v in env.items()))
write(root/'projector.env','LC_SOURCE_DATABASE_URL="postgresql://lc_source_reader:'+keys['readerPassword']+'@127.0.0.1:5432/knowledge_base"\n')
modules=release/'node_modules'
runtime_modules=root/'runtime/node_modules'
runtime_modules.parent.mkdir(parents=True,exist_ok=True)
if not runtime_modules.exists():run('cp','-a','--reflink=auto','/opt/knowledge-base/node_modules',str(runtime_modules))
if modules.is_symlink():modules.unlink()
if not modules.exists():modules.symlink_to(runtime_modules,target_is_directory=True)
run('/usr/bin/node-20','--env-file='+str(root/'app.env'),str(release/'intelligence/low-carbon/bootstrap.mjs'),cwd=release,env={'PATH':os.environ['PATH']})
write('/etc/systemd/system/low-carbon.slice','''[Unit]
Description=Low-carbon resource budget
[Slice]
CPUQuota=
MemoryMax=infinity
TasksMax=infinity
''',0o644)
common='''Restart=on-failure
RestartSec=15
Slice=low-carbon.slice
EnvironmentFile=/opt/low-carbon/app.env
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/low-carbon/data
InaccessiblePaths=/opt/knowledge-base /opt/ocean-intelligence /root
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=localhost
UMask=0007
'''
for name,user,script in [('app','lowcarbon','run.mjs'),('projector','lcprojector','shared-projector-run.mjs')]:
 write('/etc/systemd/system/low-carbon-'+name+'.service',f'''[Unit]
Description=Low-carbon shared {name}
After=network.target
[Service]
Type={'oneshot' if name=='projector' else 'simple'}
TimeoutStartSec=0
TimeoutStopSec=10
User={user}
Group=lowcarbon
WorkingDirectory={release}
CPUWeight={1000 if name=='app' else 100}
ExecStart=/usr/bin/node-20 --expose-gc {release}/intelligence/low-carbon/{script}
'''+common+('EnvironmentFile=/opt/low-carbon/projector.env\n' if name=='projector' else '')+'''[Install]
WantedBy=multi-user.target
''',0o644)
current=root/'current';tmp=root/'current.next'
if tmp.is_symlink():tmp.unlink()
tmp.symlink_to(release,target_is_directory=True);tmp.replace(current)
write('/etc/systemd/system/low-carbon-projector.timer',"""[Unit]
Description=Check local low-carbon projection requests
[Timer]
OnBootSec=15
OnUnitInactiveSec=30
AccuracySec=1
Unit=low-carbon-projector.service
[Install]
WantedBy=timers.target
""",0o644)
run('systemctl','disable','low-carbon-projector.service');run('systemctl','daemon-reload');run('systemctl','disable','low-carbon-app.service','low-carbon-projector.timer')
print(json.dumps({'installed':True,'release':str(release),'database':'low_carbon_kb','port':3201,'modelCredentials':False}))
