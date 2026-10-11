const fs=require('fs'),path=require('path'),root=process.argv[2]||process.cwd();
const file=path.join(root,'intelligence/public/app.js'),s=fs.readFileSync(file,'utf8');
if(!s.includes('MP_CLEAN_UI_V2')){
 if(!s.includes('统计范围：该订阅全量资料。'))throw Error('Missing funnel UI');
 const out=s.replace('统计范围：该订阅全量资料。','已采集 = 已纳入 + 候选 + 排除 + 待处理。统计该订阅全量资料。').replace("countHelp('文章 / 文档 '+data.documents.filter(d=>d.sourceId===s.id)","countHelp('智库文档 '+data.documents.filter(d=>d.sourceId===s.id)");
 fs.writeFileSync(file,'// MP_CLEAN_UI_V2\n'+out);
}
