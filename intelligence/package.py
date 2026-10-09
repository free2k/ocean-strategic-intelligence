import pathlib,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
out=root/'.data'/'ocean-intel-release.tar.gz'
with tarfile.open(out,'w:gz') as t:
    for p in (root/'intelligence').rglob('*'):
        if p.is_file() and p.suffix not in ['.png'] and p.name not in ['maintenance-edit.cjs','finish-edits.cjs']:
            t.add(p,arcname='intelligence/'+p.relative_to(root/'intelligence').as_posix())
    for p in (root/'.data/intelligence').iterdir():
        if p.is_file() and (p.suffix=='.html' or p.name=='snapshot.json'):t.add(p,arcname='seed/'+p.name)
print(out)
