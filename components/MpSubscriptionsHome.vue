<script setup lang="ts">
const route=useRoute(),router=useRouter(),toast=useToast();
const {data,refresh}=await useFetch<any>('/api/subscriptions');
const view=computed(()=>['add','activity'].includes(String(route.query.view))?String(route.query.view):'accounts');
const search=ref(String(route.query.q||'')),filter=ref(route.query.type==='x'?'x':'mp'),articleUrl=ref(''),busy=ref(false);
const accounts=computed(()=>data.value?.list?.filter((s:any)=>s.present)||[]);
const contentRank=(s:any)=>Number(s.ready)>0?2:Number(s.count)>0?1:0;
const latestTime=(s:any)=>Date.parse(s.latest)||0;
const rows=computed(()=>accounts.value.filter((s:any)=>s.payload.platform===filter.value&&s.payload.name.toLowerCase().includes(search.value.trim().toLowerCase())).sort((a:any,b:any)=>contentRank(b)-contentRank(a)||latestTime(b)-latestTime(a)||Number(b.count)-Number(a.count)||a.payload.name.localeCompare(b.payload.name,'zh-CN')));
watch(()=>route.query.type,v=>{filter.value=v==='x'?'x':'mp'});
const labels:Record<string,string>={queued:'等待执行',running:'进行中',completed:'已完成',partial:'部分失败',failed:'失败',uncertain:'需核对'};
const actions:Record<string,string>={refresh:'更新账号列表',sync:'同步文章',batch_sync:'批量同步',batch_subscribe:'添加订阅',batch_unsubscribe:'订阅调整',batch_discover:'查找与核验',batch_verified_subscribe:'核验后添加'};
const date=(s:any)=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'暂无';
const pendingFor=(id:string)=>data.value?.queue?.jobs?.find((j:any)=>j.action==='sync'&&(!j.target||j.target===id)||j.action==='batch_sync'&&j.request?.includes(id));
const queuePosition=(id:string)=>Math.max(0,(data.value?.queue?.jobs||[]).findIndex((j:any)=>j.id===id));
const articleLink=(s:any)=>({path:'/wechat/subscription-articles',query:{source:s.id,q:search.value||undefined,type:filter.value||undefined}});
function tab(value:string){router.push({query:{...route.query,view:value==='accounts'?undefined:value}});}
watch([search,filter],()=>router.replace({query:{...route.query,q:search.value||undefined,type:filter.value||undefined}}));
async function action(body:any){busy.value=true;try{await $fetch('/api/subscriptions/action',{method:'POST',body});toast.add({title:'任务已排队，可在同步记录查看进度'});if(body.action==='subscribe')articleUrl.value='';await refresh();}catch(e:any){toast.add({title:e.data?.message||'操作未完成',color:'red'});}finally{busy.value=false;}}
let timer:ReturnType<typeof setInterval>;onMounted(()=>{timer=setInterval(()=>refresh(),15000)});onUnmounted(()=>clearInterval(timer));
</script>
<template>
 <div class="max-w-7xl mx-auto space-y-6 pb-8">
 <p v-if="data?.observedAt" class="text-xs text-gray-500">公众号／X 来源范围 · 原文链接去重 · 数据时间 {{date(data.observedAt)}}；与全库采用同一分类口径。</p>
  <header class="flex flex-wrap justify-between items-start gap-4"><div><h1 class="text-2xl font-bold">公众号与 X 订阅</h1><p class="text-sm text-gray-500 mt-2">管理关注的账号，查看文章与同步进度</p></div><UButton v-if="view!=='add'" @click="tab('add')">添加订阅</UButton></header>
  <UAlert v-if="!data?.configured" color="orange" title="订阅服务尚未配置" description="请配置 Mp2RSS 后开始同步。"/>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"><p class="text-xs text-gray-500">订阅账号</p><p class="text-2xl font-semibold mt-1">{{accounts.length}}</p><p class="text-xs text-gray-500 mt-1">公众号 {{accounts.filter((s:any)=>s.payload.platform==='mp').length}} · X {{accounts.filter((s:any)=>s.payload.platform==='x').length}}</p></div>
   <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"><p class="text-xs text-gray-500">公众号／X 文章总数</p><p class="text-2xl font-semibold mt-1">{{data?.classification?.total??'—'}}</p></div>
   <div v-for="item in [{key:'accepted',label:'公众号／X 已纳入'},{key:'excluded',label:'公众号／X 已排除'},{key:'pending',label:'公众号／X 待筛选'}]" :key="item.key" class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"><p class="text-xs text-gray-500">{{item.label}}</p><p class="text-2xl font-semibold mt-1">{{data?.classification?.[item.key]??'—'}}</p></div>
   <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"><p class="text-xs text-gray-500">公众号 / X 采集</p><p class="font-semibold mt-2">每 {{data?.intervalMinutes||360}} 分钟</p><p class="text-xs text-gray-500 mt-1">全量采集计划 {{date(data?.state?.nextRunAt)}}</p></div>
  </div>
  <p class="text-sm text-gray-500">文章总数 = 已纳入 + 已排除 + 待筛选，按原文链接去重；与情报证据中心选择“公众号／X”时使用相同口径。同步进度：{{data?.bridge?.delivered??"—"}} / {{data?.bridge?.eligible??"—"}} 篇符合条件的文章已同步（已纳入且正文完整）。</p>
  <nav aria-label="订阅管理功能" class="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-3"><UButton v-for="t in [{id:'accounts',label:'订阅账号'},{id:'add',label:'添加订阅'},{id:'activity',label:'同步记录'}]" :key="t.id" :variant="view===t.id?'solid':'ghost'" :aria-current="view===t.id?'page':undefined" @click="tab(t.id)">{{t.label}}</UButton></nav>
  <p class="text-xs text-gray-500">公众号与 X 每轮全量采集结束后间隔 6 小时；智库外部来源巡检为另一项 12 小时任务。手动同步进入队列，执行器约每分钟检查一次。</p>
  <section v-if="view==='accounts'" class="space-y-4" aria-label="订阅账号列表">
   <p class="text-sm text-gray-500">Mp2RSS 收录与正文状态合并展示；历史文章单列统计非 Mp2RSS 渠道入库、且未被 Mp2RSS 重复收录的记录。最新文章时间仍以 Mp2RSS 为准。<NuxtLink to="/articles" class="text-primary-500">查看全部入库文章 →</NuxtLink></p>
   <p class="text-xs text-gray-500">非 Mp2RSS 历史文章共 {{data?.history?.total||0}} 篇，其中当前订阅账号 {{data?.history?.subscribed||0}} 篇；其他来源或未关联当前订阅 {{(data?.history?.total||0)-(data?.history?.subscribed||0)}} 篇。历史文章按账号标识关联，无有效标识时仅使用唯一同名账号。</p>
   <div role="group" aria-label="渠道类型" class="flex gap-3"><UButton v-for="t in [{id:'mp',label:'微信公众号'},{id:'x',label:'X 渠道'}]" :key="t.id" :variant="filter===t.id?'solid':'soft'" :aria-pressed="filter===t.id" @click="filter=t.id">{{t.label}} · {{accounts.filter((s:any)=>s.payload.platform===t.id).length}}</UButton></div>
   <div class="flex flex-wrap gap-3 items-center"><UInput v-model="search" placeholder="搜索账号名称" aria-label="搜索账号名称" class="w-full sm:w-64"/><span class="text-sm text-gray-500">{{rows.length}} 个账号</span><div class="flex gap-2 sm:ml-auto"><UButton variant="soft" :loading="busy" @click="action({action:'refresh'})">更新账号列表</UButton><UButton variant="soft" :loading="busy" @click="action({action:'sync'})">同步全部</UButton></div></div>
   <p class="text-xs text-gray-500">排序：已有正文优先，其次为仅收录文章，空账号最后；同组按最新文章时间从新到旧排列。</p>
   <div v-if="!rows.length" class="rounded-lg border border-gray-700 p-10 text-center text-gray-500">{{accounts.length?'没有匹配的账号，请调整搜索条件。':'暂无订阅账号，请先添加订阅。'}}</div>
   <div v-if="rows.length" class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
    <table class="w-full table-fixed text-sm text-left min-w-[640px]" aria-label="订阅源列表">
     <colgroup><col style="width:22%"><col style="width:20%"><col style="width:15%"><col style="width:28%"><col style="width:15%"></colgroup>
     <thead class="bg-gray-50 dark:bg-gray-800 text-gray-500"><tr><th class="px-3 py-3 font-medium">账号</th><th class="px-3 py-3 font-medium">Mp2RSS 收录 / 正文</th><th class="px-3 py-3 font-medium">历史文章<br><span class="text-xs">非 Mp2RSS</span></th><th class="px-3 py-3 font-medium">更新时间 / 同步状态</th><th class="px-3 py-3 font-medium">操作</th></tr></thead>
     <tbody class="divide-y divide-gray-200 dark:divide-gray-700"><tr v-for="s in rows" :key="s.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/40">
      <th scope="row" class="px-3 py-4 font-medium break-words"><NuxtLink :to="articleLink(s)" class="text-primary-500">{{s.payload.name}}</NuxtLink><p v-if="s.payload.handle" class="text-xs text-gray-500 mt-1 break-all">@{{s.payload.handle}}</p><UCheckbox v-if="s.payload.platform==='x'" class="mt-2" :model-value="s.posts" label="采集推文" @update:model-value="v=>action({action:'update',id:s.id,posts:v})"/></th>
      <td class="px-3 py-4 tabular-nums break-words">{{s.count}} 篇<NuxtLink v-if="s.count>s.ready" :to="{path:articleLink(s).path,query:{...articleLink(s).query,origin:'mp2rss',body:'missing'}}" class="block text-xs mt-1 text-orange-500 underline">{{s.count-s.ready}} 篇待补正文 →</NuxtLink><p v-else class="text-xs mt-1 text-gray-500">{{!s.count?'暂无文章':'正文齐全'}}</p><p v-for="reason in s.body_reasons" :key="reason.code" class="text-xs text-gray-500 mt-1">{{reason.label}} · {{reason.count}} 篇</p></td>
      <td class="px-3 py-4 tabular-nums"><NuxtLink :to="{path:articleLink(s).path,query:{...articleLink(s).query,origin:'legacy'}}" class="text-primary-500">{{s.legacy_count||0}} 篇</NuxtLink></td>
      <td class="px-3 py-4 text-xs text-gray-500 break-words"><p>最新文章：{{date(s.latest)}}</p><p class="mt-1">完成同步：{{date(s.last_sync)}}</p><p class="mt-2"><span v-if="pendingFor(s.id)" class="text-primary-500">{{pendingFor(s.id).status==='running'?'正在同步':'等待执行'}} #{{pendingFor(s.id).id}}<span v-if="pendingFor(s.id).status==='queued'" class="block mt-1">前方 {{queuePosition(pendingFor(s.id).id)}} 个任务</span></span><span v-else-if="s.error" class="text-orange-500">{{s.error}}</span><span v-else>{{s.last_sync?'自动更新':'待首次同步'}}</span></p></td>
      <td class="px-3 py-4"><div class="flex flex-col items-start gap-2"><UButton :to="articleLink(s)" size="xs" variant="soft">查看文章</UButton><UButton variant="ghost" size="xs" :disabled="busy||!!pendingFor(s.id)" @click="action({action:'sync',id:s.id})">立即同步</UButton></div></td>
     </tr></tbody>
    </table>
   </div>
  </section>
  <section v-else-if="view==='add'" class="space-y-5" aria-label="添加订阅">
   <UCard><template #header><h2 class="font-semibold">通过文章链接添加</h2></template><p class="text-sm text-gray-500 mb-3">粘贴公众号任意一篇文章的原文链接。没有链接时，可在下方导入名称，让系统查找历史资料与网络来源。</p><div class="flex flex-wrap gap-3"><UInput v-model="articleUrl" aria-label="公众号文章链接" placeholder="https://mp.weixin.qq.com/s/…" class="flex-1 min-w-48"/><UButton :disabled="!articleUrl||busy" @click="action({action:'subscribe',articleUrl})">添加公众号</UButton></div></UCard>
   <MpSubscriptionBatch :list="data?.list||[]" @changed="refresh"/>
   <p class="text-sm text-gray-500">X 账号及订阅调整请在 <a href="https://mp2rss.bugcode.dev" target="_blank" rel="noopener noreferrer" class="text-primary-500">Mp2RSS 管理 ↗</a> 中完成，再更新账号列表。</p>
  </section>
  <section v-else class="space-y-4" aria-label="同步记录">
   <div class="flex justify-between gap-3"><div><h2 class="font-semibold">最近任务</h2><p class="text-xs text-gray-500 mt-1">采集完成后，符合领域规则的文章继续进入翻译与分析。</p></div><UButton variant="ghost" @click="refresh()">刷新记录</UButton></div>
   <UCard v-for="j in data?.jobs" :key="j.id"><div class="flex flex-wrap justify-between gap-2"><h3 class="font-medium">{{actions[j.action]||'订阅任务'}} <span class="text-gray-500 text-xs">#{{j.id}}</span></h3><span class="text-sm">{{['partial','failed'].includes(j.status)?'已结束':labels[j.status]||j.status}}</span></div><p class="text-xs text-gray-500 mt-2">{{date(j.created_at)}}</p><p v-if="j.status==='queued'" class="text-sm text-gray-500 mt-2">前方 {{queuePosition(j.id)}} 个任务；等待执行器下一轮检查或当前任务结束。完成后才更新账号的同步时间。</p><p v-if="j.result?.current" class="text-sm mt-2">{{j.result.current.name}} · {{j.result.current.stage}}</p><p v-if="j.result?.discovery" class="text-sm mt-2">已核验 {{j.result.discovery.length}} / {{j.request?.length||j.result.discovery.length}} 个账号</p><p v-else-if="j.result?.batch" class="text-sm mt-2">成功 {{j.result.batch.filter((r:any)=>r.status==='completed').length}} · 共 {{j.result.batch.length}} 项</p><p v-else-if="j.result" class="text-sm mt-2">新增 {{j.result.inserted||0}} · 更新 {{j.result.updated||0}} · 重复 {{j.result.duplicate||0}}</p><details v-if="j.result||j.error" class="text-xs mt-3"><summary class="cursor-pointer text-primary-500">同步明细</summary><p class="mt-2">任务结果：{{labels[j.status]||j.status}}<span v-if="j.result?.failed"> · 失败 {{j.result.failed}}</span></p><p v-if="j.error" class="text-orange-500 mt-2">{{j.error}}</p><p class="text-gray-500 mt-2">新增：首次收录到 Mp2RSS 本地记录；更新：已有记录内容发生变化；重复：内容未变。以上是采集数量，不是分类通过数量。</p><p v-for="r in j.result?.batch||[]" :key="r.value" class="py-2 break-all">{{r.expected?.name||r.value}} · {{labels[r.status]||r.status}} {{r.error}}</p><p v-for="(r,i) in j.result?.streams||[]" :key="i" class="py-2">{{data?.list?.find((s:any)=>s.id===r.source)?.payload.name||r.source}}：新增 {{r.inserted||0}} · 更新 {{r.updated||0}} · 重复 {{r.duplicate||0}} · 失败 {{r.failed||0}} {{r.error}}</p></details></UCard>
   <p v-if="!data?.jobs?.length" class="text-gray-500 py-10 text-center">暂无同步记录</p>
   <p class="text-sm text-gray-500">同步至工作库 {{data?.bridge?.delivered||0}} 篇 · 中文可读 {{data?.bridge?.translated||0}} 篇 · 完成抽取 {{data?.bridge?.extracted||0}} 篇。</p>
   <details><summary class="cursor-pointer text-sm text-gray-500">外链与图表采集明细</summary><MpEvidenceDetails/></details>
  </section>
 </div>
</template>
