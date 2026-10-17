#!/usr/bin/env python3
import pathlib,hashlib,json,tarfile
root=pathlib.Path(__file__).resolve().parents[2];baseline=pathlib.Path('/tmp/strategy-production-baseline')
files=[root/f for f in ['intelligence/server.mjs','intelligence/quant-routes.mjs','intelligence/public/app.js','intelligence/public/index.html','intelligence/public/strategy-workbench.js','intelligence/public/strategy-workbench.css','intelligence/tests/strategy-engine.test.mjs','intelligence/tests/strategy-workbench.test.mjs','intelligence/tests/strategy-fixture.mjs']]
for name in ['intelligence/strategy','intelligence/public/strategy']:files.extend(p for p in (root/name).rglob('*') if p.is_file())
files=sorted(set(files));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
manifest={'release':'20261018-strategy-workbench-1.2.0','sourceCommit':'fdfe3d6','files':[{'path':str(p.relative_to(root)),'sha256':sha(p),'previousSha256':sha(baseline/p.relative_to(root))} for p in files]}
out=pathlib.Path('/tmp/strategy-release');out.mkdir(exist_ok=True)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
with tarfile.open(out/'program.tar.gz','w:gz') as tar:
 for p in files:tar.add(p,arcname=str(p.relative_to(root)),recursive=False)
print(json.dumps({'files':len(files),'archive':str(out/'program.tar.gz'),'bytes':(out/'program.tar.gz').stat().st_size}))
