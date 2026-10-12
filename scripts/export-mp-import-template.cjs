const fs=require('fs'),p=JSON.parse(fs.readFileSync('.data/wechatPost-preview.json','utf8'));
fs.writeFileSync('docs/wechatPost_待补文章链接.txt',p.rows.filter(r=>r.status==='needs_link').map(r=>r.name+'\t').join('\n')+'\n');
const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';
fs.writeFileSync('docs/wechatPost_导入核对.csv','\uFEFF'+[['公众号名称','匹配结果','文章链接'],...p.rows.map(r=>[r.name,r.status==='existing'?'已订阅':'待补文章链接',''])].map(r=>r.map(q).join(',')).join('\r\n'));
console.log({existing:p.counts.existing,needsLink:p.counts.needs_link});
