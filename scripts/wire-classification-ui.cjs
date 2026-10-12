const fs=require('fs'),file='components/AdminFiltersTab.vue';let s=fs.readFileSync(file,'utf8');
s=s.replace("const applyLoading = ref(false);","const historyFlow = ref<any>(null);\nconst applyLoading = ref(false);");
// Every successful mutation opens the impact preview; no historical job is silently submitted.
s=s.replaceAll("emit('changed');", "emit('changed');\n    await historyFlow.value?.preview();");
s=s.replace("  refresh();\n}\n\n// 目标", "  refresh();\n  await historyFlow.value?.preview();\n}\n\n// 目标");
s=s.replace("    importResult.value = `导入成功：${result.imported} 条规则`;\n    refresh();", "    importResult.value = `导入成功：${result.imported} 条规则`;\n    refresh();\n    await historyFlow.value?.preview();");
s=s.replace(/async function applyFilters\(\) \{[\s\S]*?\n\}\n\nconst reapplyLoading/,"async function applyFilters() { await historyFlow.value?.preview(true); }\n\nconst reapplyLoading");
s=s.replace(/async function reapplyAll\(\) \{[\s\S]*?\n\}\n\nasync function runClassifyStream/,"async function reapplyAll() { await historyFlow.value?.preview(); }\n\nasync function runClassifyStream");
s=s.replace('  <div class="space-y-6 pt-4">','  <div class="space-y-6 pt-4">\n    <ClassificationHistoryFlow ref="historyFlow" :source-id="targetSourceId" :since-date="targetSinceDate" @published="emit(\'changed\')" />');
s=s.replace('"执行筛选"会保留现有已归类的文章，"重新分类"则所有文章按照最新规则重新覆盖分类。','执行筛选预览待分类文章；重新分类预览所选历史范围，确认后联动更新文章库、Mp2RSS 和智库。人工标注保留。');
fs.writeFileSync(file,s);
