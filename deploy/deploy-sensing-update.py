"""Run under the intelligence publication lock; preserve data and existing PM2 settings."""
import pathlib,sys,tarfile,shutil,subprocess,datetime,os,time,json,urllib.request
root=pathlib.Path('/opt/ocean-intelligence');current=root/'current';previous=current.resolve()
archive=pathlib.Path(sys.argv[1]).resolve()
if archive.parent!=pathlib.Path('/tmp') or not archive.name.startswith('ocean-sensing-'):raise RuntimeError('Invalid archive')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
release=root/'releases'/stamp
shutil.copytree(previous,release,symlinks=True,ignore=shutil.ignore_patterns('node_modules','seed','.git'))
(release/'node_modules').symlink_to('/opt/knowledge-base/node_modules')
with tarfile.open(archive) as tf:
 for member in tf.getmembers():
  target=(release/member.name).resolve()
  if not target.is_relative_to(release) or member.issym() or member.islnk():raise RuntimeError('Invalid archive member')
 tf.extractall(release)
def run(*args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def switch(target):
 tmp=root/'current-next';tmp.unlink(missing_ok=True);tmp.symlink_to(target);os.replace(tmp,current)
run('node','--check',str(release/'intelligence/server.mjs'))
run('node','--check',str(release/'intelligence/public/sensing.js'))
shutil.copy2(root/'data/snapshot.json',root/('snapshot-before-sensing-'+stamp+'.json'))
try:
 run('pm2','stop','ocean-intelligence');switch(release);run('pm2','restart','ocean-intelligence')
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3101/api/health',timeout=3) as r:health=json.load(r)
   if health.get('ok'):break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('Health check failed')
 run('pm2','save')
 print(json.dumps({'release':str(release),'previous':str(previous),'health':health}))
except Exception:
 switch(previous);run('pm2','restart','ocean-intelligence');raise
