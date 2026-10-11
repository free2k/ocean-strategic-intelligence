<script setup lang="ts">
const toast=useToast();
const {data,refresh}=await useFetch<any>('/api/subscriptions');
const {data:evidence,refresh:refreshEvidence}=await useFetch<any>('/api/subscriptions/evidence');
const articleUrl=ref(''),busy=ref(false),filter=ref(''),itemSource=ref(''),page=ref(1);
const {data:articles,refresh:refreshArticles}=await useFetch<any>('/api/subscriptions/items',{query:{source:itemSource,page}});
const rows=computed(()=>data.value?.list?.filter((s:any)=>!filter.value||s.payload.platform===filter.value)||[]);
const labels:Record<string,string>={queued:'等待执行',running:'正在同步',completed:'完成',partial:'部分失败',failed:'失败',paused:'暂停',complete:'正文已获取',pending_body:'等待正文',media_only:'仅媒体',accepted:'主题通过',unmatched:'待筛选',excluded:'已排除'};
const date=(s:any)=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'暂无';
async function action(body:any){busy.value=true;try{await $fetch('/api/subscriptions/action',{method:'POST',body});toast.add({title:['sync','refresh'].includes(body.action)?'任务已排队，服务每分钟检查待执行任务':'设置已保存'});await refresh();await refreshArticles();}catch(e:any){toast.add({title:'操作未完成',description:e.data?.message||'请稍后重试',color:'red'});}finally{busy.value=false;}}
async function unsubscribe(s:any){if(window.confirm(`取消 Mp2RSS 中「${s.payload.name}」的订阅？后续停止更新，已入库文章保留。`))await action({action:'unsubscribe',id:s.id,confirm:true});}
let timer:ReturnType<typeof setInterval>;onMounted(()=>{timer=setInterval(()=>{refresh();refreshArticles();refreshEvidence();},15000)});onUnmounted(()=>clearInterval(timer));
watch(itemSource,()=>page.value=1);
</script>
<template>
 <div class="space-y-6 max-w-7xl mx-auto">
  <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="text-2xl font-bold">公众号与 X 订阅管理</h1><p class="text-sm text-gray-500 mt-2">Mp2RSS · 原文出处保留 · 旧扫码采集已停用</p></div><a href="https://mp2rss.bugcode.dev" target="_blank" rel="noopener noreferrer" class="text-primary-500">供应商控制台 ↗</a></div>
  <UAlert :color="data?.configured?'green':'orange'" :title="data?.configured?'聚合 Feed 配置已读取（凭据隐藏）':'未配置 MP2_RSS_LINK'" description="公众号与 X 长文自动接入。X 推文默认关闭，可逐账号开启。首次同步近 3 天，后续增量回扫；只获取供应商已有内容。" />
  <div class="flex flex-wrap gap-3 items-center"><UButton :loading="busy" @click="action({action:'refresh'})">刷新远端订阅</UButton><UButton :loading="busy" variant="soft" @click="action({action:'sync'})">同步所有已启用内容流</UButton><USelect v-model="filter" :options="[{label:'全部账号',value:''},{label:'公众号',value:'mp'},{label:'X',value:'x'}]"/><span class="text-sm text-gray-500">自动间隔 {{data?.intervalMinutes}} 分钟 · 下次 {{date(data?.state?.nextRunAt)}}</span></div>
  <div class="flex flex-wrap gap-2"><UInput v-model="articleUrl" placeholder="粘贴公众号文章链接来新增订阅" class="flex-1 min-w-48"/><UButton :disabled="!articleUrl||busy" @click="action({action:'subscribe',articleUrl})">添加公众号</UButton></div>
  <p class="text-xs text-gray-500">X 账号新增或取消请前往供应商控制台，再点击“刷新远端订阅”。本地暂停不会取消付费订阅。空列表可能表示尚无收录，不等于采集故障。</p>
  <p class="text-sm text-gray-500">智库处理：主题通过 {{data?.bridge?.eligible||0}} 篇，已投递 {{data?.bridge?.delivered||0}} 篇，中文可读 {{data?.bridge?.translated||0}} 篇，完成抽取 {{data?.bridge?.extracted||0}} 篇。其他资料保留在文章库待筛选。</p>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
   <UCard v-for="s in rows" :key="s.id"><div class="flex justify-between gap-2"><div><h2 class="font-semibold">{{s.payload.name}}</h2><span class="text-xs text-gray-500">{{s.payload.platform==='mp'?'微信公众号':'X'}} {{s.payload.handle?'@'+s.payload.handle:''}}</span></div><UBadge :color="s.present?'green':'gray'">{{s.present?'远端已订阅':'远端已取消'}}</UBadge></div>
    <div class="flex flex-wrap gap-4 my-4"><UCheckbox :model-value="s.enabled" label="启用采集" @update:model-value="v=>action({action:'update',id:s.id,enabled:v})"/><UCheckbox :model-value="s.articles" :label="s.payload.platform==='mp'?'文章':'长文'" @update:model-value="v=>action({action:'update',id:s.id,articles:v})"/><UCheckbox v-if="s.payload.platform==='x'" :model-value="s.posts" label="推文（含引用／线程）" @update:model-value="v=>action({action:'update',id:s.id,posts:v})"/></div>
    <p class="text-sm">已收录 {{s.count}} · 已有正文 {{s.ready}} · {{labels[s.status]||'待同步'}}</p><p class="text-xs text-gray-500 mt-2">最新原文：{{date(s.latest)}}<br>最近检查：{{date(s.last_sync)}}</p><p v-if="s.error" class="text-orange-500 text-sm">{{s.error}}</p>
    <div class="flex flex-wrap gap-2 mt-4"><UButton size="xs" :disabled="busy||!s.enabled||!s.present" @click="action({action:'sync',id:s.id})">同步此账号</UButton><UButton size="xs" variant="ghost" @click="itemSource=s.id">查看文章</UButton><UButton v-if="s.payload.platform==='mp'&&s.present" size="xs" variant="ghost" color="red" :disabled="busy" @click="unsubscribe(s)">取消远端订阅</UButton></div>
   </UCard>
  </div>
  <UCard><template #header><div class="flex gap-3 items-center"><h2 class="font-semibold">新渠道收录资料</h2><UButton v-if="itemSource" size="xs" variant="ghost" @click="itemSource=''">显示全部</UButton><span class="text-sm">{{articles?.total||0}} 条</span></div></template>
   <div v-if="!articles?.items?.length" class="text-gray-500">暂无符合条件的资料。可查看下方任务执行结果。</div>
   <div v-for="a in articles?.items" :key="a.article_id" class="py-3 border-b border-gray-200 dark:border-gray-700"><a :href="a.url" target="_blank" rel="noopener noreferrer" class="text-primary-500">{{a.title}} ↗</a><p class="text-xs text-gray-500 mt-1">{{a.author}} · {{date(a.published_at)}} · {{a.kind}} · {{labels[a.content_status]}} · {{labels[a.classification]}}（{{a.reason}}）</p></div>
   <div class="flex gap-3 mt-4"><UButton size="xs" :disabled="page<=1" @click="page--">上一页</UButton><span>{{page}}</span><UButton size="xs" :disabled="page*30>=(articles?.total||0)" @click="page++">下一页</UButton><NuxtLink to="/articles" class="text-sm text-primary-500">进入全部文章库 →</NuxtLink></div>
  </UCard>
  <UCard><template #header><h2 class="font-semibold">外部文章与图表证据（X / RSS）</h2></template>
   <div v-if="evidence?.oilprice" class="my-3 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm"><p>OilPrice · 最近检查 {{date(evidence.oilprice.checkedAt)}} · 每轮结束后 30 分钟检查新增</p><p v-for="f in evidence.oilprice.feeds" :key="f.url">{{f.name}}：{{f.status==='success'?'读取成功':'获取失败，下轮重试'}} · Feed 窗口 {{f.count||0}} 条</p><p class="text-xs text-gray-500 mt-2">窗口条数不是新增或分析完成数量；摘要与正文分开，文章去重后进入持久队列。未通过六类规则的资料不进入智库。</p><NuxtLink to="/wechat/rss" class="text-primary-500">管理 RSS 来源 →</NuxtLink></div>
   <p class="text-sm text-gray-500">线程独立展开 → 原文清洗与中文翻译 → 按原项目六大类别筛选。未命中与排除资料保留；图片识别不直接生成精确趋势。</p>
   <div class="flex flex-wrap gap-2 my-3"><UBadge v-for="c in evidence?.counts" :key="c.kind+c.status" color="gray">{{c.kind}} / {{c.status}}：{{c.count}}</UBadge></div>
   <p class="text-xs text-gray-500">最近处理：{{date(evidence?.state?.lastRunAt)}} · 失败自动重试。下方展示最近30项。</p>
   <div v-for="d in evidence?.documents" :key="d.url" class="py-3 border-b border-gray-200 dark:border-gray-700"><a :href="d.url" target="_blank" rel="noopener noreferrer" class="text-primary-500">{{d.title_zh||d.title}} ↗</a><p class="text-xs">{{d.classification.primary||'未分类'}} · {{labels[d.classification.status]}} · {{d.classification.reason}} · {{d.status}}</p><p class="text-xs text-gray-500">文章日期：{{d.published_at?date(d.published_at):'原文未明确'}} · 规则版本 {{d.classification.version}}</p></div>
   <details class="mt-3"><summary>外链／附件采集状态</summary><div v-for="a in evidence?.items" :key="a.url" class="py-2 text-xs break-all"><a :href="a.url" target="_blank" rel="noopener noreferrer">{{a.title||a.url}}</a> · {{a.status}}<p>{{a.summary_zh||a.error}}</p></div></details>
  </UCard>
  <UCard><template #header><h2 class="font-semibold">同步任务（采集状态，不代表 AI 加工完成）</h2></template><div v-for="j in data?.jobs" :key="j.id" class="py-3 border-b border-gray-200 dark:border-gray-700"><p>#{{j.id}} · {{j.action==='refresh'?'刷新订阅':'内容同步'}} · {{labels[j.status]}} · {{date(j.created_at)}}</p><p v-if="j.result" class="text-sm text-gray-500">新增 {{j.result.inserted}}／更新 {{j.result.updated}}／重复 {{j.result.duplicate}}／失败 {{j.result.failed}}</p><p v-if="j.error" class="text-sm text-orange-500">{{j.error}}</p><details v-if="j.result?.streams?.length" class="text-xs mt-2"><summary>各内容流结果</summary><p v-for="(r,i) in j.result.streams" :key="i">{{r.source}} / {{r.kind}}：新增 {{r.inserted}}，重复 {{r.duplicate}}，失败 {{r.failed}} {{r.error}}</p></details></div></UCard>
 </div>
</template>
