const fs=require('fs'),f='components/MpSubscriptionsHome.vue';let s=fs.readFileSync(f,'utf8');
s=s.replace('<USelect v-model="filter" aria-label="账号类型" :options="[{label:\'全部类型\',value:\'\'},{label:\'微信公众号\',value:\'mp\'},{label:\'X\',value:\'x\'}]"/>','');
s=s.replace('<section v-if="view===\'accounts\'" class="space-y-4" aria-label="订阅账号列表">',`<section v-if="view==='accounts'" class="space-y-4" aria-label="订阅账号列表">
   <div role="group" aria-label="渠道类型" class="flex gap-3"><UButton v-for="t in [{id:'mp',label:'微信公众号'},{id:'x',label:'X 渠道'}]" :key="t.id" :variant="filter===t.id?'solid':'soft'" :aria-pressed="filter===t.id" @click="filter=t.id">{{t.label}} · {{accounts.filter((s:any)=>s.payload.platform===t.id).length}}</UButton></div>`);
s=s.replace('已订阅账号自动更新。点击“查看文章”进入该账号的独立文章列表。','排序：已有正文优先，其次为仅收录文章，空账号最后；同组按最新文章时间从新到旧排列。');fs.writeFileSync(f,s);
