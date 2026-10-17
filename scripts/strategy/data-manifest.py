#!/usr/bin/env python3
import pathlib,hashlib,json,sys,os
root=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);rows={}
for parent,dirs,files in os.walk(root,followlinks=False):
 for name in files:
  p=pathlib.Path(parent)/name
  if p.is_symlink():rows[str(p.relative_to(root))]={'symlink':os.readlink(p)};continue
  h=hashlib.sha256()
  with p.open('rb') as f:
   for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
  rows[str(p.relative_to(root))]={'size':p.stat().st_size,'sha256':h.hexdigest()}
target.write_text(json.dumps(rows,sort_keys=True));target.chmod(0o600)
print(json.dumps({'files':len(rows),'bytes':sum(r.get('size',0) for r in rows.values()),'manifest':str(target)}))
