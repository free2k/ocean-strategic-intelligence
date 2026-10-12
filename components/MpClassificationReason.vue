<script setup lang="ts">
import {topicLabel} from '~/intelligence/industry-topics.mjs';
defineProps<{article:any}>();
const methods:Record<string,string>={llm:'大模型识别',manual:'人工标注',keyword:'关键词规则'};
const states:Record<string,string>={accepted:'已纳入',pending:'候选',rejected:'已排除'};
</script>
<template>
 <details class="text-xs text-gray-500 mt-3"><summary class="cursor-pointer">查看分类依据</summary>
  <div v-if="article.origin==='legacy'" class="mt-3 rounded border border-gray-200 dark:border-gray-700 p-3 space-y-2"><p>历史分类方式：{{methods[article.article_method]||'未记录'}}</p><p>状态：{{states[article.article_status]||'未记录'}} · 领域：{{article.article_topic||'未指定'}}</p><p>判定原因：{{article.article_reason||'历史记录未保存详细判定理由或命中关键词。'}}</p></div>
  <div v-else class="mt-3 rounded border border-gray-200 dark:border-gray-700 p-3 space-y-3">
   <p class="font-medium">分类方式：{{methods[article.classification_method]||'关键词规则'}}</p>
   <p v-if="article.classification_details?.semantic?.status==='pending'">等待 Qwen 语义复核，暂保留候选。</p>
   <p v-if="article.classification_details?.semantic?.model">判断模型：{{article.classification_details.semantic.model}}</p>
   <blockquote v-if="article.classification_details?.semantic?.quote" class="border-l-2 pl-3">原文证据：{{article.classification_details.semantic.quote}}</blockquote>
   <p>判定原因：{{article.reason||'暂无记录'}}<span v-if="article.classification_details?.primary"> · 主领域：{{topicLabel(article.classification_details.primary)}}</span></p>
   <div><p class="font-medium">正向关键词</p><p v-if="!article.classification_details?.positive?.length" class="mt-1">无命中记录</p><div v-for="(p,i) in article.classification_details?.positive||[]" :key="i" class="mt-2"><p>{{topicLabel(p.topic)}} · {{p.origin}}</p><div class="flex flex-wrap gap-2 mt-1"><span v-for="(k,n) in p.keywords||[]" :key="n" class="rounded bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1">{{k.keyword}}（{{k.field}}）</span></div></div></div>
   <div><p class="font-medium">反向关键词（命中时优先排除）</p><p v-if="!article.classification_details?.negative?.length" class="mt-1">无命中记录</p><div class="flex flex-wrap gap-2 mt-1"><span v-for="(k,n) in article.classification_details?.negative||[]" :key="n" class="rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-1">{{k.keyword}}（{{k.field}}）</span></div></div>
   <p v-if="article.classification_details?.primary" >主领域依据：{{article.classification_details.primaryBasis}}</p><p v-if="article.classification_details?.version">采集规则版本：{{article.classification_details.version}}</p>
   <div v-if="article.article_method&&article.article_method!==article.classification_method" class="border-t border-gray-700 pt-2"><p>文章库后续分类：{{methods[article.article_method]||article.article_method}} · {{states[article.article_status]||article.article_status}} · {{article.article_topic||'未指定领域'}}</p><p>{{article.article_reason||'未保存详细判定理由；上方为采集阶段的规则证据。'}}</p></div>
  </div>
 </details>
</template>
