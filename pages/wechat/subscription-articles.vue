<script setup lang="ts">
const route=useRoute(),router=useRouter(),toast=useToast(),busy=ref(false);
const source=computed(()=>String(route.query.source||'')),page=computed(()=>Math.max(1,Number(route.query.page)||1));
const {data:subscriptions,refresh:refreshSubscriptions}=await useFetch<any>('/api/subscriptions');
const account=computed(()=>subscriptions.value?.list?.find((s:any)=>s.id===source.value));
const bodyFilter=computed(()=>route.query.body==='missing'?'missing':'all');
const origin=computed(()=>['mp2rss','legacy'].includes(String(route.query.origin))?String(route.query.origin):'all');
const {data,refresh,pending}=await useFetch<any>('/api/subscriptions/items',{query:{source,page,body:bodyFilter,origin}});
const editing=ref<any>(null),manualText=ref(''),saving=ref(false);
async function saveBody(){saving.value=true;try{await $fetch('/api/subscriptions/body',{method:'POST',body:{itemId:editing.value.item_id,content:manualText.value}});editing.value=null;manualText.value='';await Promise.all([refresh(),refreshSubscriptions()]);toast.add({title:'正文已保存并重新分类，后续分析已排队'});}catch(e:any){toast.add({title:e.data?.message||'保存失败',color:'red'});}finally{saving.value=false;}}
const back=computed(()=>({path:'/wechat/subscriptions',query:{q:route.query.q,type:route.query.type}}));
const labels:Record<string,string>={complete:'正文已获取',pending_body:'等待正文',media_only:'仅媒体',accepted:'已纳入领域',unmatched:'候选资料',excluded:'已排除'};
const date=(s:any)=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'暂无';
function changePage(n:number){router.push({query:{...route.query,page:n===1?undefined:String(n)}});}
async function sync(){busy.value=true;try{await $fetch('/api/subscriptions/action',{method:'POST',body:{action:'sync',id:source.value}});toast.add({title:'该账号已加入同步队列'});}catch(e:any){toast.add({title:e.data?.message||'同步失败',color:'red'});}finally{busy.value=false;}}
let timer:ReturnType<typeof setInterval>;onMounted(()=>{timer=setInterval(()=>refresh(),15000)});onUnmounted(()=>clearInterval(timer));
</script>
<template>
 <div class="max-w-5xl mx-auto space-y-6 pb-8">
  <NuxtLink :to="back" class="inline-flex text-sm text-primary-500">← 返回订阅账号</NuxtLink>
  <header class="flex flex-wrap justify-between items-start gap-4"><div><p class="text-sm text-gray-500 mb-2">{{account?.payload.platform==='x'?'X':'微信公众号'}} / 文章列表</p><h1 class="text-2xl font-bold">{{account?.payload.name||'账号文章'}}</h1><p class="text-sm text-gray-500 mt-2">账号共 {{data?.counts?.all_count||0}} 篇 · {{data?.counts?.ready||0}} 篇已有正文 · 当前筛选 {{data?.total||0}} 篇</p></div><div class="flex gap-2"><UButton v-if="account?.present" :loading="busy" variant="soft" @click="sync">同步此账号</UButton><UButton variant="ghost" @click="refresh()">刷新列表</UButton></div></header>
  <UAlert v-if="!account" color="orange" title="未找到该订阅账号" description="请返回账号列表重新选择。"/>
  <template v-else>
   <p class="text-xs text-gray-500">统一展示「{{account.payload.name}}」的 Mp2RSS 与旧渠道历史文章，包含纳入、候选和排除记录。按账号标识关联，重复入库 ID 或相同原文链接只展示一次，按发布时间从新到旧排列。历史正文状态按旧库是否保存内容判断。点击标题打开原文。</p>
   <div class="flex flex-wrap gap-2" role="group" aria-label="文章来源"><UButton v-for="t in [{id:'all',label:'全部来源',count:data?.counts?.all_count},{id:'mp2rss',label:'Mp2RSS',count:data?.counts?.mp2rss},{id:'legacy',label:'历史文章',count:data?.counts?.legacy}]" :key="t.id" :variant="origin===t.id?'solid':'soft'" :aria-pressed="origin===t.id" @click="router.push({query:{...route.query,origin:t.id==='all'?undefined:t.id,page:undefined}})">{{t.label}} · {{t.count||0}}</UButton></div>
   <div class="flex gap-3"><UButton :variant="bodyFilter==='all'?'solid':'soft'" @click="router.push({query:{...route.query,body:undefined,page:undefined}})">全部正文状态</UButton><UButton :variant="bodyFilter==='missing'?'solid':'soft'" @click="router.push({query:{...route.query,body:'missing',page:undefined}})">仅看待补正文</UButton></div>
   <UCard v-if="!data?.items?.length"><p class="py-10 text-center text-gray-500">{{pending?'正在加载文章…':bodyFilter==='missing'?'当前账号没有待补正文的文章。':'该账号暂未收录文章。同步完成后会在此显示。'}}</p></UCard>
   <UCard v-else><article v-for="a in data.items" :key="a.item_id" class="py-5 first:pt-0 last:pb-0 border-b last:border-b-0 border-gray-200 dark:border-gray-700">
    <a :href="a.url" target="_blank" rel="noopener noreferrer" class="font-medium text-primary-500 leading-relaxed break-words">{{a.title}} ↗</a><p class="text-xs text-gray-500 mt-2">{{date(a.published_at)}} · {{a.kind==='x_post'?'推文':a.kind==='x_article'?'X 长文':'公众号文章'}}</p>
    <div class="flex flex-wrap gap-2 mt-3"><UBadge color="gray" variant="soft">{{a.origin==='legacy'?'历史文章 · 非 Mp2RSS':'Mp2RSS'}}</UBadge><UBadge color="gray" variant="soft">{{a.body_reason?.label||labels[a.content_status]||'待处理'}}</UBadge><UBadge v-if="a.body_origin==='manual'" color="gray" variant="soft">手动补充正文</UBadge><UBadge color="gray" variant="soft">{{labels[a.classification]||'待分类'}}</UBadge><UButton v-if="a.origin==='mp2rss'&&a.kind==='mp_article'&&(a.content_status!=='complete'||a.body_origin==='manual')" size="xs" variant="soft" @click="editing=a;manualText=''">{{a.body_origin==='manual'?'重新补充正文':'手动补充正文'}}</UButton><UButton v-if="a.origin==='legacy'&&a.content_status!=='complete'" to="/articles" size="xs" variant="soft">到文章库处理</UButton></div>
    <p v-if="a.body_reason" class="mt-3 p-3 rounded bg-orange-50 dark:bg-orange-950/30 text-sm text-gray-600 dark:text-gray-300" data-body-reason>缺正文原因：{{a.body_reason.detail}}</p>
    <MpClassificationReason :article="a"/>
   </article></UCard>
   <nav v-if="data?.total" aria-label="文章分页" class="flex flex-wrap justify-between items-center gap-3"><span class="text-sm text-gray-500">第 {{page}} / {{Math.max(1,Math.ceil(data.total/30))}} 页</span><div class="flex gap-3"><UButton variant="soft" :disabled="page<=1||pending" @click="changePage(page-1)">上一页</UButton><UButton variant="soft" :disabled="page*30>=data.total||pending" @click="changePage(page+1)">下一页</UButton></div></nav>
  </template>
  <UModal :model-value="!!editing" @update:model-value="v=>{if(!v)editing=null}"><UCard><template #header><h2 class="font-semibold">手动补充正文</h2><p class="text-sm mt-2">{{editing?.title}}</p></template><p class="text-xs text-gray-500 mb-3">打开原文后复制正文，至少 80 字。请保留原文数据和单位；手动正文会保留，不会被后续自动同步覆盖。</p><UTextarea v-model="manualText" :rows="12" placeholder="粘贴文章正文"/><template #footer><UButton :loading="saving" :disabled="manualText.trim().length<80" @click="saveBody">保存并重新分类</UButton></template></UCard></UModal>
 </div>
</template>
