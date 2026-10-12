<script setup lang="ts">
const props=defineProps<{sourceId?:string,sinceDate?:string,scope?:Record<string,any>,scopeLabel?:string}>();
const emit=defineEmits<{published:[]}>();
const panel=ref<HTMLElement|null>(null);
const impact=ref<any>(null),jobs=ref<any[]>([]),busy=ref(false),error=ref('');
const names:Record<string,string>={queued:'等待后台领取',classifying:'历史文章分类中',processing:'分类已写入，正在补投递与提取',completed:'已发布到智库与图表',partial:'已发布，部分提取待重试',failed:'处理失败'};
const statuses:Record<string,string>={accepted:'纳入',excluded:'排除',unmatched:'候选'};
const active=computed(()=>jobs.value.some(j=>['queued','classifying','processing'].includes(j.status)));
async function preview(pendingOnly=false){busy.value=true;error.value='';try{const r:any=await $fetch('/api/filters/reprocess',{query:{preview:'1',sourceId:props.sourceId||undefined,sinceDate:props.sinceDate||undefined,pendingOnly,...props.scope}});impact.value=r.preview;await nextTick();panel.value?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e:any){error.value=e.data?.message||'影响范围计算失败，请重试';}finally{busy.value=false;}}
async function refresh(){try{const r:any=await $fetch('/api/filters/reprocess');const published=r.jobs.some((j:any)=>['completed','partial'].includes(j.status)&&jobs.value.some(old=>old.id===j.id&&old.status!==j.status));jobs.value=r.jobs;if(published)emit('published');}catch{error.value='任务状态暂时无法读取，请刷新重试';}}
async function submit(){if(!impact.value)return;busy.value=true;error.value='';try{await $fetch('/api/filters/reprocess',{method:'POST',body:{version:impact.value.version,previewToken:impact.value.previewToken,...impact.value.scope}});impact.value=null;await refresh();}catch(e:any){error.value=e.data?.message||'提交失败';}finally{busy.value=false;}}
let timer:ReturnType<typeof setInterval>;
onMounted(()=>{refresh();timer=setInterval(refresh,5000);});onBeforeUnmount(()=>clearInterval(timer));
watch(()=>[props.sourceId,props.sinceDate,JSON.stringify(props.scope)],()=>{impact.value=null;});
defineExpose({preview});
</script>
<template>
 <section ref="panel" class="rounded-lg border border-gray-300 dark:border-gray-700 p-4 space-y-3" aria-label="历史分类与智库更新">
  <div class="flex flex-wrap justify-between gap-3"><h3 class="font-semibold">历史分类与智库更新</h3><UButton size="sm" :loading="busy" @click="preview()">预览历史影响范围</UButton></div>
  <p class="text-sm text-gray-500">先预览影响范围，再确认提交后台任务，保留人工分类。新纳入且有正文的文章补投递，分类发生变化的文章更新提取，排除内容退出分析统计。</p>
  <p v-if="scopeLabel" class="text-sm font-medium">筛选范围：{{scopeLabel}}（全部匹配结果，跨分页）</p>
  <p v-if="scope?.targeted" class="text-sm text-gray-500">仅重分类匹配的文章并同步其智库记录，其他文章保留原有分类。</p>
  <p v-if="error" role="alert" class="text-sm text-red-500">{{error}}</p>
  <div v-if="impact" class="rounded bg-gray-100 dark:bg-gray-800 p-3 space-y-3" aria-label="历史影响预览">
   <p class="font-medium">规则版本 {{impact.version}} · {{impact.scope.targeted?'当前列表筛选结果':impact.scope.pendingOnly?'待分类文章':'历史文章（含候选、排除）'}}</p>
   <p class="text-sm">范围 {{impact.total}} 篇：Mp2RSS {{impact.mp2rss}} · 其他历史 {{impact.legacy}} · 保留人工分类 {{impact.manual}}</p>
   <p class="text-sm">预计分类变化 {{impact.changed}} · 新纳入 {{impact.newlyAccepted}} · 退出纳入 {{impact.removed}}</p>
   <p class="text-sm">规则预估：纳入 {{impact.accepted}} · 候选 {{impact.candidate}} · 排除 {{impact.excluded}}；可投递正文 {{impact.eligible}} 篇，缺正文 {{impact.missingBody}} 篇。候选中有正文的文章还会进行 Qwen 语义复核，最终纳入数量可能变化。</p>
   <p class="text-sm" v-if="impact.intelligence">智库现有文档 {{impact.intelligence.total}} 篇同步新规则，预计分类变化 {{impact.intelligence.changed}} 篇。</p>
   <details v-if="impact.samples.length"><summary class="cursor-pointer text-sm">查看变化示例</summary><ul class="text-sm mt-2 space-y-2"><li v-for="s in impact.samples" :key="s.id">{{s.title}}：{{statuses[s.before]}} → {{statuses[s.after]}} {{s.topic}}（{{s.reason}}）</li></ul></details>
   <p class="text-xs text-gray-500">统计时间 {{new Date(impact.previewedAt).toLocaleString()}}（预览缓存 5 分钟）。执行时新增资料可能使数量变化。缺正文不会伪造提取结果，自动提取可能消耗现有模型额度。</p>
   <UButton :disabled="active" :loading="busy" @click="submit">确认重分类、补投递并更新图表</UButton>
   <p v-if="active" class="text-sm">已有任务正在处理，发布后可继续提交。</p>
  </div>
  <div v-for="job in jobs.slice(0,4)" :key="job.id" class="border-t border-gray-200 dark:border-gray-700 pt-3 text-sm space-y-1">
   <p><strong>任务 #{{job.id}} · {{names[job.status]||job.status}}</strong> · 规则 {{job.version}}</p>
   <p class="text-gray-500">提交 {{new Date(job.created_at).toLocaleString()}}<span v-if="job.finished_at"> · 发布 {{new Date(job.finished_at).toLocaleString()}}</span></p>
   <p v-if="job.status==='queued'">等待后台任务领取；后台约每分钟检查，正在进行的智库任务结束后接续处理。关闭页面不会取消任务。</p>
   <p v-if="job.result.total!=null">已分类 {{job.result.total}} · 纳入 {{job.result.accepted}} · 候选 {{job.result.candidate}} · 排除 {{job.result.excluded}} · 缺正文 {{job.result.missingBody}}</p>
   <p v-if="job.result.published">已关联智库文档 {{job.result.documents}} · 提取完成 {{job.result.extracted}} · 提取待完成 {{job.result.pendingExtraction}}</p>
   <p v-if="job.result.pendingSemantic">语义复核待完成 {{job.result.pendingSemantic}} 篇，后台分批处理，失败自动重试。</p>
   <p v-if="job.error" class="text-amber-600 dark:text-amber-400">{{job.error}}</p>
  </div>
 </section>
</template>
