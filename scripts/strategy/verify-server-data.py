#!/usr/bin/env python3
import pathlib,os,json,hashlib,sys
root=pathlib.Path('/opt/ocean-intelligence/data');backup=pathlib.Path('/opt/ocean-intelligence/backups/strategy-workbench-20261017');before=backup/'data-stat.before.json'
def inventory():
 result={}
 for parent,dirs,files in os.walk(root,followlinks=False):
  for f in files:
   p=pathlib.Path(parent)/f;s=p.stat();result[str(p.relative_to(root))]={'size':s.st_size,'mtime':s.st_mtime_ns,'inode':s.st_ino,'link':os.readlink(p) if p.is_symlink() else None}
 return result
if '--before' in sys.argv:
 x=inventory();before.write_text(json.dumps(x));before.chmod(0o600);print(json.dumps({'baselineFiles':len(x)}));sys.exit()
old=json.loads(before.read_text());current=inventory();hashes=json.loads((backup/'data-manifest.before.json').read_text());missing=[];changed=[];equivalent=[]
for name,meta in old.items():
 if name not in current:missing.append(name);continue
 if current[name]==meta:continue
 p=root/name
 if 'sha256' in hashes.get(name,{}):
  h=hashlib.sha256(p.read_bytes()).hexdigest()
  if h==hashes[name]['sha256']:equivalent.append(name);continue
 if name.endswith('.json'):
  try:
   if json.loads(p.read_text())==json.loads((backup/'data'/name).read_text()):equivalent.append(name);continue
  except (ValueError,OSError):pass
 changed.append(name)
report={'originalFiles':len(old),'missingFiles':missing,'changedOriginalFiles':changed,'equivalentRewrites':equivalent,'addedFiles':len(set(current)-set(old))};(backup/'data-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));sys.exit(1 if missing or changed else 0)
