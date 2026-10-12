<script setup lang="ts">
const props=defineProps<{list:any[]}>(),emit=defineEmits(['changed']);
const toast=useToast(),text=ref(''),preview=ref<any[]>([]),selected=ref<string[]>([]),busy=ref(false);
const names:Record<string,string>={existing:'已订阅，跳过',ready:'可以新增',needs_link:'待补文章链接',invalid:'链接无效',duplicate:'重复，跳过',ambiguous:'名称不唯一，需核对'};
const ready=computed(()=>preview.value.filter(r=>r.status==='ready'));
async function check(){busy.value=true;try{const r=await $fetch<any>('/api/subscriptions/batch',{method:'POST',body:{action:'preview',text:text.value}});preview.value=r.rows;}catch(e:any){toast.add({title:e.data?.message||'预览失败',color:'red'});}finally{busy.value=false;}}
async function file(e:Event){const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;if(f.size>100000){toast.add({title:'文件不能超过100KB',color:'red'});return;}text.value=await f.text();await check();}
async function recheck(){text.value=preview.value.map(r=>[r.name,r.url].filter(Boolean).join('\t')).join('\n');await check();}
async function submit(action:string,entries:string[]){if(action==='batch_unsubscribe'&&!window.confirm(`将取消 ${entries.length} 个公众号的 Mp2RSS 远端订阅，已入库文章保留。是否继续？`))return;busy.value=true;try{const r=await $fetch<any>('/api/subscriptions/batch',{method:'POST',body:{action,entries,confirm:action==='batch_unsubscribe'}});toast.add({title:`批量任务 #${r.id} 已排队，请查看下方任务结果`});emit('changed');selected.value=[];if(action==='batch_subscribe')preview.value=[];}catch(e:any){toast.add({title:e.data?.message||'提交失败',color:'red'});}finally{busy.value=false;}}
</script>
<template>
 <UCard><template #header><h2 class="font-semibold">按名称或 TXT 批量添加</h2></template>
  <p class="text-sm text-gray-500">TXT 每行一个公众号名称、文章链接，或“名称 + 文章链接”。系统优先匹配已有订阅和历史文章，再检索缺失链接；也可以手动补充。</p>
  <input class="my-3" type="file" accept=".txt,text/plain" :disabled="busy" aria-label="导入公众号TXT" @change="file">
  <UTextarea v-model="text" :rows="4" placeholder="中国能源报&#10;公众号名称 https://mp.weixin.qq.com/s/文章标识" aria-label="批量订阅文本" :disabled="busy" @update:model-value="preview=[]"/>
  <UButton class="my-3" :disabled="busy||!text.trim()" @click="check">解析并匹配订阅</UButton>
  <div v-if="preview.length" class="space-y-2">
   <p>共 {{preview.length}} 行 · 可新增 {{ready.length}} · 已订阅 {{preview.filter(r=>r.status==='existing').length}} · 待补链接 {{preview.filter(r=>r.status==='needs_link').length}}</p>
   <div v-for="(r,i) in preview" :key="i" class="flex flex-wrap items-center gap-2 border-b py-2"><span class="min-w-48">{{r.name||'文章链接'}}</span><span class="text-sm text-gray-500">{{names[r.status]}}</span><UInput v-if="r.status!=='existing'&&r.status!=='duplicate'" v-model="r.url" class="flex-1 min-w-64" placeholder="补充公众号文章链接后点击重新校验" @update:model-value="r.status='needs_link'"/></div>
   <div class="flex gap-3"><UButton :disabled="busy" variant="soft" @click="recheck">重新校验链接</UButton><UButton :disabled="busy||!ready.length" @click="submit('batch_subscribe',ready.map(r=>r.url))">提交 {{ready.length}} 个新增订阅</UButton></div>
  </div>
  <MpDiscoveryPanel :names="preview.filter(r=>['needs_link','ambiguous'].includes(r.status)&&r.name).map(r=>r.name)" :subscribed-names="props.list.filter(s=>s.present&&s.payload.platform==='mp').map(s=>s.payload.name)" @changed="emit('changed')"/>

 </UCard>
</template>
