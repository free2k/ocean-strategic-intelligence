"""Authorized release: staged health/API checks, additive derived migration, atomic code switch."""
import sys,pathlib,subprocess,tarfile,shutil,datetime,os,json,time,urllib.request,hmac,hashlib,fcntl
root=pathlib.Path('/opt/ocean-intelligence');lock=open(root/'ui-publish.lock','a');fcntl.flock(lock,fcntl.LOCK_EX)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');previous=(root/'current').resolve();release=root/'releases'/stamp
shutil.copytree(previous,release,symlinks=True,ignore=shutil.ignore_patterns('node_modules','seed','.git'))
(release/'node_modules').symlink_to('/opt/knowledge-base/node_modules')
with tarfile.open('/tmp/ocean-sensing-research-20261015.tar.gz') as tf:
 for m in tf.getmembers():
  if not (release/m.name).resolve().is_relative_to(release.resolve()) or m.issym() or m.islnk():raise RuntimeError('Unsafe archive')
 tf.extractall(release)
def run(args,env=None):return subprocess.check_output(args,env=env,stderr=subprocess.PIPE,text=True)
env=dict(os.environ);config={}
for line in pathlib.Path('/opt/knowledge-base/.env').read_text().splitlines():
 if '=' in line and not line.startswith('#'):
  k,v=line.split('=',1);config[k]=v.strip().strip('"').strip("'")
exp=str(int(time.time()*1000)+600000);token=exp+'.'+hmac.new(config['SITE_PASSWORD'].encode(),exp.encode(),hashlib.sha256).hexdigest()
def api(port,route):
 req=urllib.request.Request('http://127.0.0.1:'+str(port)+route,headers={'Cookie':'ocean_auth='+token})
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
proc=next(x for x in json.loads(run(['pm2','jlist'])) if x['name']=='ocean-intelligence')
flags={k:v for k,v in proc['pm2_env'].items() if k.startswith('INTEL_') and isinstance(v,str)}
backup=root/'backups'/('research-'+stamp);backup.mkdir(parents=True);(backup/'release.json').write_text(json.dumps({'previous':str(previous),'release':str(release),'flags':flags},indent=2));os.chmod(backup/'release.json',0o600)
run(['node','--check',str(release/'intelligence/server.mjs')])
migration=run(['node','--env-file=/opt/knowledge-base/.env',str(release/'intelligence/research/migrate-archive-cli.mjs'),'--archive',str(release/'research-seed'),'--publish-derived']+(['--expected-release',sys.argv[1]] if len(sys.argv)>1 else []))
stageenv={**env,**flags,'INTEL_PORT':'3197','INTEL_DATA_DIR':str(root/'data'),'INTEL_SCHEDULE':'false','INTEL_RESEARCH_BACKEND':'postgres','INTEL_RESEARCH_CAPTURE':'false'}
log=open(backup/'stage.log','w');stage=subprocess.Popen(['node','--env-file=/opt/knowledge-base/.env',str(release/'intelligence/run.mjs')],env=stageenv,cwd=release,stdout=log,stderr=log)
def switch(target):
 tmp=root/'current-research-next';tmp.unlink(missing_ok=True);tmp.symlink_to(target);os.replace(tmp,root/'current')
try:
 for _ in range(30):
  try:
   health=api(3197,'/api/health')
   if health.get('ok'):break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('Staging health failed')
 case=api(3197,'/api/research/countries?countryCodes=NO,SE&relationMode=within')
 assert len(case['data']['caseStudies'])==1 and case['data']['countryCaseCoverage']['SE']==1
 assert sum(p['status']=='ready' for p in api(3197,'/api/research/briefs')['data'])==6
 stage.terminate();stage.wait(timeout=15)
 switch(release)
 liveenv={**env,**flags,'INTEL_RESEARCH_BACKEND':'postgres','INTEL_RESEARCH_CAPTURE':'false'}
 run(['pm2','restart','ocean-intelligence','--update-env'],liveenv)
 for _ in range(30):
  try:
   checked=api(3101,'/api/research/countries?countryCodes=NO,SE&relationMode=within')
   if len(checked['data']['caseStudies'])==1:break
  except Exception:time.sleep(.5)
 else:raise RuntimeError('Live API check failed')
 run(['pm2','save']);report={'published':True,'release':str(release),'previous':str(previous),'backup':str(backup),'caseStudies':len(checked['data']['caseStudies']),'swedenCases':checked['data']['countryCaseCoverage'].get('SE'),'norwayCases':checked['data']['countryCaseCoverage'].get('NO'),'sourceRecordsOverwritten':False,'researchCapture':'explicit historical publication, collection preserved'}
 (backup/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
except Exception:
 switch(previous);run(['pm2','restart','ocean-intelligence','--update-env'],{**env,**flags,'INTEL_RESEARCH_BACKEND':'','INTEL_RESEARCH_CAPTURE':'false'});raise
finally:
 if stage.poll() is None:stage.terminate();stage.wait(timeout=15)
 log.close()

