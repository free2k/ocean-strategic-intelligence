const fs=require('fs');
const f='intelligence/import-mp2rss.mjs';let s=fs.readFileSync(f,'utf8');
s="import {reconcileDocument} from './reconcile-classification.mjs';\n"+s;
s=s.replaceAll('d.industry=row.classification;', 'reconcileDocument(d,row.classification);').replaceAll('existing.industry=row.classification;', 'reconcileDocument(existing,row.classification);');
fs.writeFileSync(f,s);
