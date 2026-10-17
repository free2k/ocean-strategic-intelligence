#!/usr/bin/env python3
import pathlib,json,hashlib,shutil
base=pathlib.Path('/opt/ocean-intelligence/backups/strategy-workbench-20261017');target=base/'data-manifest.before.json';initial=base/'data-manifest.initial.json'
if not initial.exists():shutil.copy2(target,initial)
old=json.loads(initial.read_text());metadata=json.loads((base/'data-stat.before.json').read_text());marker=(base/'data-backup.complete').stat().st_mtime_ns;result={};refreshed=0
for name,stat in metadata.items():
 p=base/'data'/name
 if not p.exists():raise RuntimeError('Missing backup file: '+name)
 if name not in old or stat['mtime']>marker:
  if p.stat().st_size!=stat['size']:raise RuntimeError('Backup size differs from predeployment file: '+name)
  if p.is_symlink():result[name]={'symlink':str(p.readlink())}
  else:
   h=hashlib.sha256()
   with p.open('rb') as f:
    for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
   result[name]={'size':stat['size'],'sha256':h.hexdigest()}
  refreshed+=1
 else:result[name]=old[name]
target.write_text(json.dumps(result,sort_keys=True));target.chmod(0o600)
summary={'files':len(result),'bytes':sum(r.get('size',0) for r in result.values()),'incrementalFilesHashed':refreshed,'initialFiles':len(old)};(base/'file-backup-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
