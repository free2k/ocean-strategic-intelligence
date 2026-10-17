#!/usr/bin/env python3
"""Code-only release. Never imports, migrates, replaces or restores business data."""
import pathlib,json,hashlib,tarfile,subprocess,os,time,shutil,sys
base=pathlib.Path('/opt/ocean-intelligence');incoming=base/'strategy-workbench-stage';backup=base/'backups/strategy-workbench-20261017';current=base/'current';old=current.resolve();manifest=json.loads((incoming/'manifest.json').read_text());release=base/'releases'/manifest['release'];node='/usr/bin/node-20'
if '--stage-only' not in sys.argv and (not (backup/'data-backup.complete').exists() or not (backup/'database-counts.before.json').exists() or not (backup/'data-manifest.before.json').exists()):sys.exit('Verified file and database backups are required')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
for item in manifest['files']:
 rel=pathlib.PurePosixPath(item['path'])
 if rel.is_absolute() or '..' in rel.parts or rel.parts[0]!='intelligence':sys.exit('Unsafe release path')
 if sha(old/rel)!=item['previousSha256']:sys.exit('Parallel production change detected: '+str(rel))
already_staged=release.exists() and (release/'.strategy-manifest.json').exists() and json.loads((release/'.strategy-manifest.json').read_text())==manifest
if release.exists() and not already_staged:sys.exit('Release directory exists; choose a new version')
if not already_staged:
 # Keep a complete program rollback copy; all persistence remains outside the release.
 with tarfile.open(backup/'program-before.tar.gz','w:gz') as archive:archive.add(old/'intelligence',arcname='intelligence')
 (backup/'previous-release.txt').write_text(str(old)+'\n');shutil.copytree(old,release,symlinks=True)
 with tarfile.open(incoming/'program.tar.gz') as archive:
  expected={i['path'] for i in manifest['files']}
  for m in archive.getmembers():
   if m.name not in expected or not m.isfile():sys.exit('Unexpected archive member')
   dest=release/m.name;dest.parent.mkdir(parents=True,exist_ok=True)
   with archive.extractfile(m) as src,dest.open('wb') as dst:shutil.copyfileobj(src,dst)
 for item in manifest['files']:
  target=release/item['path']
  if sha(target)!=item['sha256']:sys.exit('Checksum mismatch: '+item['path'])
  if target.suffix in ['.js','.mjs']:subprocess.run([node,'--check',str(target)],check=True,stdout=subprocess.DEVNULL)
 log=(backup/'release-tests.log').open('w');result=subprocess.run([node,'--test','intelligence/tests/strategy-engine.test.mjs','intelligence/tests/strategy-workbench.test.mjs'],cwd=release,stdout=log,stderr=subprocess.STDOUT);log.close()
 if result.returncode:sys.exit('Release regression tests failed; original service untouched')
 (release/'.strategy-manifest.json').write_text(json.dumps(manifest,indent=2))
if '--stage-only' in sys.argv:
 print(json.dumps({'status':'staged','release':str(release),'tests':'passed','productionChanged':False}));sys.exit(0)
# Read-only authenticated readiness checks. The existing site secret never leaves the server.
probe="""
process.loadEnvFile('/opt/knowledge-base/.env');const {createHmac}=await import('node:crypto');const expiry=String(Date.now()+60000),token=expiry+'.'+createHmac('sha256',process.env.SITE_PASSWORD).update(expiry).digest('hex');const r=await fetch('http://127.0.0.1:3101/api/collection',{headers:{Cookie:'ocean_auth='+token}});if(!r.ok)throw Error('readiness authentication failed');const x=await r.json();if(x.running){console.log('busy');process.exit(75);}console.log('idle');
"""
ready=subprocess.run([node,'--input-type=module','-e',probe],cwd=old,capture_output=True,text=True)
if ready.returncode==75:sys.exit('Existing collection or processing is active; release staged, service untouched')
if ready.returncode:sys.exit('Could not verify the existing worker state; service untouched')
# Bring forward unrelated edits made after staging. Only the explicit manifest is replaced.
protected={i['path'] for i in manifest['files']}
for parent,dirs,files in os.walk(old,followlinks=False):
 for name in list(dirs)+files:
  src=pathlib.Path(parent)/name;rel=src.relative_to(old)
  if str(rel) in protected:continue
  dest=release/rel
  if src.is_symlink():
   if not dest.is_symlink() or os.readlink(dest)!=os.readlink(src):
    if dest.is_symlink() or dest.is_file():dest.unlink()
    elif dest.exists():raise RuntimeError('Unexpected directory at symlink path')
    dest.symlink_to(os.readlink(src))
  elif src.is_file() and sha(src)!=sha(dest):dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
link=base/'current.strategy-next';link.unlink(missing_ok=True);link.symlink_to(release);os.replace(link,current)
try:
 subprocess.run(['pm2','restart','ocean-intelligence'],check=True,stdout=subprocess.DEVNULL)
 healthy=False
 for attempt in range(30):
  time.sleep(1)
  check=subprocess.run(['curl','--fail','--silent','http://127.0.0.1:3101/api/health'],capture_output=True,text=True)
  if check.returncode==0:
   try:healthy=json.loads(check.stdout).get('ok') is True
   except ValueError:pass
   if healthy:break
 if not healthy:raise RuntimeError('New service health check failed')
 # Ensure the new protected API actually loaded, not just the old public health route.
 verify=probe.replace("/api/collection","/api/strategy/catalog").replace("if(x.running){console.log('busy');process.exit(75);}","if(x.methods?.length!==198||x.methods.filter(m=>m.status==='ready').length!==22)throw Error('catalog verification failed');")
 if subprocess.run([node,'--input-type=module','-e',verify],cwd=release,capture_output=True).returncode:raise RuntimeError('New API verification failed')
except BaseException:
 rollback=base/'current.strategy-rollback';rollback.unlink(missing_ok=True);rollback.symlink_to(old);os.replace(rollback,current);subprocess.run(['pm2','restart','ocean-intelligence'],stdout=subprocess.DEVNULL);raise
report={'release':str(release),'previousRelease':str(old),'files':len(manifest['files']),'dataDirectory':str(base/'data'),'databaseMigration':False,'status':'deployed'};(backup/'deployment.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
