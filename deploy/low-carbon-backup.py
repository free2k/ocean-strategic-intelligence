#!/usr/bin/env python3
"""Back up only low-carbon resources; --verify restores to a disposable own DB."""
import pathlib,subprocess,datetime,hashlib,json,tarfile,sys,time
root=pathlib.Path('/opt/low-carbon');out=root/'backups';out.mkdir(mode=0o700,exist_ok=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');stem='lowcarbon-'+stamp
dump=out/(stem+'.dump');archive=out/(stem+'.tar.gz')
prefix=['runuser','-u','lcpostgres','--','/usr/lib/postgresql/18/bin/']
def pg(tool,*args,**kw):return subprocess.run(prefix[:-1]+[prefix[-1]+tool,'-h','/run/low-carbon-pg','-p','55432',*args],check=True,**kw)
with dump.open('wb') as f:pg('pg_dump','-Fc','-d','low_carbon_kb',stdout=f)
dump.chmod(0o600)
with tarfile.open(archive,'w:gz') as tar:
 for name in ['intelligence','research','instance.json']:tar.add(root/'data'/name,arcname=name)
archive.chmod(0o600)
verified=False
if '--verify' in sys.argv:
 db='low_carbon_restore_test'
 pg('createdb',db)
 try:
  with dump.open('rb') as f:pg('pg_restore','--exit-on-error','-d',db,stdin=f,stdout=subprocess.DEVNULL)
  r=pg('psql','-d',db,'-At','-c',"SELECT count(*) FROM public.articles; SELECT app_id FROM public.app_instance",capture_output=True,text=True)
  rows=r.stdout.splitlines();verified=len(rows)==2 and rows[1]=='low-carbon'
  if not verified:raise RuntimeError('Restored identity mismatch')
 finally:pg('dropdb',db)
manifest={'createdAt':stamp,'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [dump,archive]},'restoreVerified':verified}
path=out/(stem+'.json');path.write_text(json.dumps(manifest,indent=2));path.chmod(0o600)
for p in out.glob('lowcarbon-*'):
 if p.is_file() and p.stat().st_mtime<time.time()-7*86400:p.unlink()
print(json.dumps(manifest))
