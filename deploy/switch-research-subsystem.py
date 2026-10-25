#!/usr/bin/env python3
"""Switch only research frontends. Collection, processing and Batch stay running."""
import fcntl,json,pathlib,subprocess,sys,time,urllib.request

SYSTEMS=('ocean','low-carbon')
STATE=pathlib.Path('/opt/knowledge-base/.data/research-subsystem.json')
PERIOD_FILES={'ocean':'/opt/ocean-intelligence/data/period-reports/runtime.json','low-carbon':'/opt/low-carbon/data/intelligence/period-reports/runtime.json'}

class SwitchError(Exception):
 def __init__(self,code,message,status=503):super().__init__(message);self.code=code;self.status=status

class Runtime:
 def run(self,*args):subprocess.run(args,check=True,capture_output=True,text=True,timeout=30)
 def ready(self,system):
  port=3101 if system=='ocean' else 3201
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/health',timeout=1) as r:return r.status==200
  except Exception:return False
 def active(self):return next((s for s in SYSTEMS if self.ready(s)),None)
 def busy(self,system):
  try:jobs=json.loads(pathlib.Path(PERIOD_FILES[system]).read_text()).get('periodReports',{}).values()
  except FileNotFoundError:return False
  # Shared daily reports belong to their own worker and survive a web switch.
  return any(j.get('status') in ('queued','running') and not str(j.get('requestId','')).startswith('daily-weekly-') for j in jobs)
 def stop(self,system):
  if system=='ocean':self.run('pm2','stop','ocean-intelligence')
  else:
   self.run('systemctl','stop','low-carbon-projector.timer')
   self.run('systemctl','stop','low-carbon-projector.service','low-carbon-app.service')
 def start(self,system):
  if system=='ocean':self.run('pm2','restart','ocean-intelligence')
  else:self.run('systemctl','start','low-carbon-app.service')
 def after_ready(self,system):
  if system=='low-carbon':self.run('systemctl','start','low-carbon-projector.timer')
 def wait(self,system):
  until=time.monotonic()+45
  while time.monotonic()<until:
   if self.ready(system):return
   time.sleep(.5)
  raise SwitchError('SUBSYSTEM_START_FAILED','目标研究服务暂未就绪，已尝试恢复原系统。')
 def save(self,system):
  STATE.parent.mkdir(parents=True,exist_ok=True);tmp=STATE.with_suffix('.tmp')
  tmp.write_text(json.dumps({'system':system,'changedAt':time.time()}));tmp.chmod(0o644);tmp.replace(STATE)

def activate(runtime,target):
 if target not in SYSTEMS:raise SwitchError('INVALID_SUBSYSTEM','请选择海洋能源或低碳研究。',400)
 previous=runtime.active()
 inactive=next(s for s in SYSTEMS if s!=target)
 if runtime.ready(inactive) and runtime.busy(inactive):raise SwitchError('RESEARCH_BUSY','当前简报正在整理，请完成后再切换；已保存的研究和草稿保留。',409)
 runtime.stop(inactive)
 try:
  changed=not runtime.ready(target)
  if changed:runtime.start(target)
  runtime.wait(target);runtime.after_ready(target);runtime.save(target)
  return {'system':target,'ready':True,'changed':changed}
 except Exception:
  try:runtime.stop(target)
  except Exception:pass
  if previous and previous!=target:
   runtime.start(previous);runtime.wait(previous);runtime.after_ready(previous);runtime.save(previous)
  raise

def main():
 target=sys.argv[1] if len(sys.argv)==2 else ''
 if target not in SYSTEMS:raise SwitchError('INVALID_SUBSYSTEM','请选择有效的研究子系统。',400)
 if pathlib.Path('/run/lock/kb-subsystem-deploying').exists():raise SwitchError('SUBSYSTEM_UPDATING','系统切换入口正在更新，请稍后重试。',503)
 lock=pathlib.Path('/run/lock/kb-research-subsystem.lock');lock.parent.mkdir(parents=True,exist_ok=True)
 with lock.open('a') as handle:
  try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise SwitchError('SUBSYSTEM_SWITCH_BUSY','已有系统正在切换，请稍后重试。',409)
  return activate(Runtime(),target)

if __name__=='__main__':
 try:result=main()
 except SwitchError as e:result={'ready':False,'code':e.code,'error':str(e),'status':e.status}
 except Exception:result={'ready':False,'code':'SUBSYSTEM_SWITCH_FAILED','error':'研究服务暂未切换完成，已保存数据保留。','status':503}
 print(json.dumps(result,ensure_ascii=False))
