const fs=require('fs'),f='components/AdminFiltersTab.vue';let s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
s=s.replace(/async function applyFilters\(\) \{[\s\S]*?\n\}\n\nconst reapplyLoading/,"async function applyFilters() { await historyFlow.value?.preview(true); }\n\nconst reapplyLoading");
s=s.replace(/async function reapplyAll\(\) \{[\s\S]*?\n\}\n\nasync function runClassifyStream/,"async function reapplyAll() { await historyFlow.value?.preview(); }\n\nasync function runClassifyStream");
s=s.replace(/async function runClassifyStream[\s\S]*?\nasync function handleImportRules/, 'async function handleImportRules');
s=s.replace("body: { enabled: !enabled } });\n  refresh();", "body: { enabled: !enabled } });\n  refresh();\n  await historyFlow.value?.preview();");
s=s.replace('    importResult.value = `导入成功：${result.imported} 条规则`;\n    refresh();', '    importResult.value = `导入成功：${result.imported} 条规则`;\n    refresh();\n    await historyFlow.value?.preview();');
fs.writeFileSync(f,s);
