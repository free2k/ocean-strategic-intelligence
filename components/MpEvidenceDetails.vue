<script setup lang="ts">
const {data:evidence}=await useFetch<any>('/api/subscriptions/evidence');
const date=(s:any)=>s?new Date(s).toLocaleString('zh-CN'):'暂无';
const labels:Record<string,string>={accepted:'已纳入',unmatched:'候选',excluded:'排除'};
</script>
<template>
  <UCard><template #header><h2 class="font-semibold">外部文章与图表证据（X / RSS）</h2></template>
   <div v-if="evidence?.oilprice" class="my-3 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm"><p>OilPrice · 最近检查 {{date(evidence.oilprice.checkedAt)}} · 每轮结束后 30 分钟检查新增</p><p v-for="f in evidence.oilprice.feeds" :key="f.url">{{f.name}}：{{f.status==='success'?'读取成功':'获取失败，下轮重试'}} · Feed 窗口 {{f.count||0}} 条</p><p class="text-xs text-gray-500 mt-2">窗口条数不是新增或分析完成数量；摘要与正文分开，文章去重后进入持久队列。未通过六类规则的资料不进入智库。</p><NuxtLink to="/wechat/rss" class="text-primary-500">管理 RSS 来源 →</NuxtLink></div>
   <p class="text-sm text-gray-500">线程独立展开 → 原文清洗与中文翻译 → 按原项目六大类别筛选。未命中与排除资料保留；图片识别不直接生成精确趋势。</p>
   <div class="flex flex-wrap gap-2 my-3"><UBadge v-for="c in evidence?.counts" :key="c.kind+c.status" color="gray">{{c.kind}} / {{c.status}}：{{c.count}}</UBadge></div>
   <p class="text-xs text-gray-500">最近处理：{{date(evidence?.state?.lastRunAt)}} · 失败自动重试。下方展示最近30项。</p>
   <div v-for="d in evidence?.documents" :key="d.url" class="py-3 border-b border-gray-200 dark:border-gray-700"><a :href="d.url" target="_blank" rel="noopener noreferrer" class="text-primary-500">{{d.title_zh||d.title}} ↗</a><p class="text-xs">{{d.classification.primary||'未分类'}} · {{labels[d.classification.status]}} · {{d.classification.reason}} · {{d.status}}</p><p class="text-xs text-gray-500">文章日期：{{d.published_at?date(d.published_at):'原文未明确'}} · 规则版本 {{d.classification.version}}</p></div>
   <details class="mt-3"><summary>外链／附件采集状态</summary><div v-for="a in evidence?.items" :key="a.url" class="py-2 text-xs break-all"><a :href="a.url" target="_blank" rel="noopener noreferrer">{{a.title||a.url}}</a> · {{a.status}}<p>{{a.summary_zh||a.error}}</p></div></details>
  </UCard>

</template>
