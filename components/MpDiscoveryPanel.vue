<script setup lang="ts">
const props=defineProps<{names:string[],subscribedNames:string[]}>(),emit=defineEmits(['changed']);
const {data,refresh}=await useFetch<any>('/api/subscriptions/discovery');const busy=ref(false),toast=useToast();
const processed=(j:any)=>j.result?.discovery?.length??j.result?.batch?.filter((r:any)=>['completed','failed','uncertain'].includes(r.status)).length??0;
const states:Record<string,string>={existing:'已订阅',verified:'原文账号一致',needs_review:'待人工核对',not_found:'未找到有效链接',ambiguous:'同名账号待确认',failed:'检索失败',mismatch:'发布账号不一致',unavailable:'原文无法访问',unverified:'身份依据不足',queued:'等待执行',running:'正在执行',completed:'已完成',partial:'部分失败'};
const results=computed(()=>data.value?.results?.filter((r:any)=>!props.names.length||props.names.includes(r.name))||[]);
const failedNames=computed(()=>results.value.filter((r:any)=>['failed','needs_review','not_found','ambiguous'].includes(r.status)).map((r:any)=>r.name));
const eligible=computed(()=>results.value.filter((r:any)=>r.status==='verified'&&!props.subscribedNames.includes(r.publisher)));
async function start(autoSubscribe:boolean,names=props.names){busy.value=true;try{const r=await $fetch<any>('/api/subscriptions/batch',{method:'POST',body:{action:'discover',names,autoSubscribe}});toast.add({title:`AI检索任务 #${r.id} 已排队`});await refresh();emit('changed');}catch(e:any){toast.add({title:e.data?.message||'检索提交失败',color:'red'});}finally{busy.value=false;}}
async function subscribe(){busy.value=true;try{const r=await $fetch<any>('/api/subscriptions/batch',{method:'POST',body:{action:'subscribe_verified',names:eligible.value.map((r:any)=>r.name)}});toast.add({title:`核验订阅任务 #${r.id} 已排队`});await refresh();emit('changed');}catch(e:any){toast.add({title:e.data?.message||'提交失败',color:'red'});}finally{busy.value=false;}}
let timer:ReturnType<typeof setInterval>;onMounted(()=>{timer=setInterval(()=>refresh(),10000)});onUnmounted(()=>clearInterval(timer));
</script>
<template>
 <div class="mt-5 rounded border border-gray-700 p-4 space-y-3">
  <h3 class="font-semibold">AI 查找公众号文章链接</h3>
  <p class="text-sm text-gray-500">优先查找本系统历史公众号、文章原链接及历史候选，再尝试微信专项搜索和 Qwen 多轮官网交叉检索；逐项核对原文发布账号和账号标识。仅核验一致的账号可自动订阅；同名、仅转载提及、验证页面与访问失败均留待核对。会消耗现有百炼搜索及模型额度。</p>
  <div class="flex flex-wrap gap-3"><UButton :disabled="busy||!props.names.length" @click="start(true)">AI 查找并订阅核验项（{{props.names.length}}）</UButton><UButton variant="soft" :disabled="busy||!props.names.length" @click="start(false)">仅查找与核验</UButton><UButton v-if="failedNames.length" variant="soft" :disabled="busy" @click="start(true,failedNames)">只重试 {{failedNames.length}} 个未通过项</UButton><UButton v-if="eligible.length" variant="soft" :disabled="busy" @click="subscribe">提交 {{eligible.length}} 个已核验账号</UButton></div>
  <p v-if="!props.names.length" class="text-xs text-gray-500">先导入 TXT 并解析名单，AI 将查找未匹配的公众号。</p>
  <p v-if="!data?.configured" class="text-sm text-orange-500">未配置模型凭据，仍可匹配本地历史资料和尝试微信专项搜索。</p>
  <div v-for="j in (data?.jobs||[]).slice(0,5)" :key="j.id" class="text-xs text-gray-500">任务 #{{j.id}} · {{j.action==='batch_verified_subscribe'?'添加订阅':'查找与核验'}} · {{states[j.status]||j.status}} · 已处理 {{processed(j)}} / {{j.request?.length||0}} 项<span v-if="j.result?.current"> · {{j.result.current.name}}：{{j.result.current.stage}}</span><span v-if="j.result?.subscriptionJob"> · 已提交订阅任务 #{{j.result.subscriptionJob}}</span><span v-if="j.error"> · {{j.error}}</span></div>
  <details v-for="r in results" :key="r.name" class="border-t border-gray-700 py-2">
   <summary>{{r.name}} · {{states[r.status]||r.status}}<span v-if="props.subscribedNames.includes(r.publisher)"> · 已订阅</span></summary>
   <p class="text-sm my-2">{{r.reason||r.stage}}</p><div v-for="(s,i) in r.stages||[]" :key="i" class="text-xs text-gray-500">{{s.stage}} · {{s.status}} · {{s.reason}}</div><a :href="'https://weixin.sogou.com/weixin?type=2&amp;query='+encodeURIComponent(r.name)" target="_blank" rel="noopener noreferrer" class="text-primary-500 text-sm">手动打开微信搜索 ↗</a><p class="text-xs text-gray-500">{{r.model}} · {{r.checkedAt?new Date(r.checkedAt).toLocaleString('zh-CN'):''}}</p>
   <div v-for="c in r.candidates||[]" :key="c.url" class="my-2 text-sm break-all"><a :href="c.url" target="_blank" rel="noopener noreferrer" class="text-primary-500">{{c.title||'查看候选原文'}} ↗</a><p v-if="c.articleId">来自本系统历史文章 #{{c.articleId}}</p><p>发布账号：{{c.publisher||'未取得'}} · {{states[c.status]||c.status}}</p><p>{{c.reason}}</p><p v-if="c.biz" class="text-xs">账号标识：{{c.biz}}</p></div>
   <details class="text-xs"><summary>检索来源（仅作线索）</summary><a v-for="s in r.sources||[]" :key="s.url" :href="s.url" target="_blank" rel="noopener noreferrer" class="block break-all text-primary-500">{{s.title||s.url}} ↗</a></details>
  </details>
 </div>
</template>
