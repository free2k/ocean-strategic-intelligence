const fs=require('fs');
const page='pages/wechat/subscriptions.vue',old=fs.readFileSync(page,'utf8');
const evidence=old.slice(old.indexOf('  <UCard><template #header><h2 class="font-semibold">外部文章'),old.indexOf('  <UCard><template #header><h2 class="font-semibold">同步任务'));
if(!evidence)throw Error('Evidence block not found');
fs.writeFileSync('components/MpEvidenceDetails.vue',`<script setup lang="ts">\nconst {data:evidence}=await useFetch<any>('/api/subscriptions/evidence');\nconst date=(s:any)=>s?new Date(s).toLocaleString('zh-CN'):'暂无';\nconst labels:Record<string,string>={accepted:'已纳入',unmatched:'候选',excluded:'排除'};\n</script>\n<template>\n${evidence}\n</template>\n`);
fs.writeFileSync(page,'<template><MpSubscriptionsHome/></template>\n');
const batch='components/MpSubscriptionBatch.vue';let s=fs.readFileSync(batch,'utf8');s=s.replace('批量导入与订阅管理','按名称或 TXT 批量添加').replace('名称仅用于匹配已有订阅；新增必须提供该公众号的一篇文章链接。不会取消文件中未列出的账号。','系统优先匹配已有订阅和历史文章，再检索缺失链接；也可以手动补充。');const start=s.indexOf('  <details class="mt-5">');const end=s.indexOf('  </details>',start);if(start>=0)s=s.slice(0,start)+s.slice(end+'  </details>'.length);fs.writeFileSync(batch,s);
