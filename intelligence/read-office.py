"""Extract only text from OOXML without running macros or unpacking paths."""
import sys, zipfile, re, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as archive:
    entries=archive.infolist()
    if len(entries)>5000 or sum(e.file_size for e in entries)>30*1024*1024:
        raise ValueError('Document expands beyond limit')
    selected=[e for e in entries if e.filename=='word/document.xml' or re.fullmatch(r'ppt/slides/slide\d+\.xml',e.filename)]
    selected.sort(key=lambda e:int(re.search(r'(\d+)\.xml',e.filename).group(1)) if 'slides/' in e.filename else 0)
    for e in selected:
        raw=archive.read(e)
        if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw: raise ValueError('Unsupported XML')
        tree=ET.fromstring(raw)
        print('\n['+e.filename+']')
        for p in tree.iter():
            if p.tag.endswith('}p'):
                print(''.join(n.text or '' for n in p.iter() if n.tag.endswith('}t')))
