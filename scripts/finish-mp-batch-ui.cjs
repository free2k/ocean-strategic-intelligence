const fs=require('fs'),p='pages/wechat/subscriptions.vue';let s=fs.readFileSync(p,'utf8');
s=s.replace("j.action==='refresh'?'刷新订阅':'内容同步'","({refresh:'刷新订阅',sync:'内容同步',batch_sync:'批量拉取',batch_subscribe:'批量新增',batch_unsubscribe:'批量取消'} as Record<string,string>)[j.action]||j.action");
if(!s.includes('批量逐项结果'))s=s.replace('<details v-if="j.result?.streams?.length"','<details v-if="j.result?.batch?.length" class="text-xs mt-2"><summary>批量逐项结果</summary><p v-for="r in j.result.batch" :key="r.value" class="break-all">{{r.value}} · {{labels[r.status]||r.status}} {{r.error}}</p></details><details v-if="j.result?.streams?.length"');
s=s.replace('v-if="j.result" class="text-sm text-gray-500"','v-if="j.result&&!j.result.batch" class="text-sm text-gray-500"');
fs.writeFileSync(p,s);
