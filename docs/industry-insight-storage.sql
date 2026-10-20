-- 产业数据洞察：2026-10-17 12:13（北京时间）在 39.96.24.170 上只读核查。
-- 运行数据库：knowledge_base；应用连接 127.0.0.1:5432，用户 kb_user。
-- ocean_intel 的业务表主要使用 id(text)、payload(jsonb)、updated_at(timestamptz)。
-- document_versions 另有 document_id、created_at，用于保留原文版本。
-- 页面读取 runs 中 id='current' 的快照后，再按领域、国家、日期等筛选并生成图表。
-- 独立业务表通过 ID 更新/插入，旧记录未全部清除，表行数不等于页面纳入数。
-- 本脚本仅查询，不创建表、不导入数据。

BEGIN READ ONLY;

-- Legacy-layout diagnostic only. Large fields now live in workspace_parts.
-- Use intelligence/workspace-storage.mjs readWorkspace(pool) for the full snapshot.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM ocean_intel.runs WHERE id='current' AND payload ? '_workspaceParts') THEN
  RAISE EXCEPTION 'Chunked workspace: use readWorkspace(pool); direct JSONB field counts are incomplete';
 END IF;
END $$;


SELECT current_database() AS database_name, current_user AS database_user;

-- 1. 独立存储：文章来源、原文/译文、文章指标、证据、实体、事件、关系。
SELECT 'ocean_intel.sources' AS table_name, count(*) AS records FROM ocean_intel.sources
UNION ALL SELECT 'ocean_intel.documents', count(*) FROM ocean_intel.documents
UNION ALL SELECT 'ocean_intel.document_versions', count(*) FROM ocean_intel.document_versions
UNION ALL SELECT 'ocean_intel.observations', count(*) FROM ocean_intel.observations
UNION ALL SELECT 'ocean_intel.evidence', count(*) FROM ocean_intel.evidence
UNION ALL SELECT 'ocean_intel.entities', count(*) FROM ocean_intel.entities
UNION ALL SELECT 'ocean_intel.events', count(*) FROM ocean_intel.events
UNION ALL SELECT 'ocean_intel.relations', count(*) FROM ocean_intel.relations;

-- 2. 当前快照：不是把每个统计值分别写进一张 series 表。
-- 核查时：当前快照有 1,312 篇原始文档、2,597 条文章指标；13 个序列，共 772 个值。
-- 页面顶部使用当前快照中保留的分类结果，并进一步筛选；显示 1,200 篇、2,395 条文章指标。
-- 分类记录另行即时重算：1,182 篇纳入、44 篇排除、86 篇未命中，与顶部统计存在口径差异。
-- 独立 observations 表为 2,858 行；旧 ID 未自动删除，不能直接当成当前页面指标数。
SELECT id, updated_at, payload->>'generatedAt' AS generated_at,
       jsonb_array_length(payload->'documents') AS snapshot_documents,
       jsonb_array_length(payload->'observations') AS snapshot_observations,
       jsonb_array_length(payload->'series') AS series_count,
       (SELECT sum(jsonb_array_length(s->'rows'))
        FROM jsonb_array_elements(payload->'series') s) AS statistical_values
FROM ocean_intel.runs
WHERE id = 'current';

-- 保存的文章分类状态（不是重新执行分类规则）：纳入 1,200、排除 11、未命中 101。
SELECT coalesce(d#>>'{industry,status}', '未记录') AS stored_status,
       count(*) AS documents
FROM ocean_intel.runs r
CROSS JOIN LATERAL jsonb_array_elements(r.payload->'documents') d
WHERE r.id = 'current'
GROUP BY stored_status;

-- 3. 展开统计序列：EIA、SODIR、Transocean、Federal Register/BOEM。
-- 每个序列保存 id/name/sourceId/unit/rows；rows 内保存 period/value/来源等。
SELECT s->>'id' AS series_id,
       s->>'name' AS metric,
       s->>'sourceId' AS source_id,
       s->>'unit' AS unit,
       p->>'period' AS period,
       (p->>'value')::numeric AS value,
       coalesce(p->>'sourceUrl', s->>'sourceUrl') AS source_url
FROM ocean_intel.runs r
CROSS JOIN LATERAL jsonb_array_elements(r.payload->'series') s
CROSS JOIN LATERAL jsonb_array_elements(s->'rows') p
WHERE r.id = 'current'
ORDER BY series_id, period;

-- 4. 登记快照：BOEM 52 条、英国 REPD 150 条、BOEM 法定文件 292 条。
-- 这里共 494 条；页面另纳入 IEA 按原表行去重的 157 条，合计 651 条。
SELECT registry_key AS registry_id,
       registry->>'name' AS name,
       coalesce(registry->>'sourceId', registry_key) AS source_id,
       jsonb_array_length(registry->'rows') AS records
FROM ocean_intel.runs r
CROSS JOIN LATERAL jsonb_each(r.payload->'assetRegistries') e(registry_key, registry)
WHERE r.id = 'current';

-- 5. IEA：datasets 对象中保存每份工作簿的 records 数组和版本、工作表、单元格。
-- 四份工作簿共 12,023 条解析记录；275 条指标/登记记录纳入。
-- 275 条并非 275 个项目：按 contentHash + sheet + 单元格行号去重后是 157 条登记。
SELECT dataset_key, dataset->>'filename' AS filename,
       dataset->>'release' AS release,
       dataset->>'contentHash' AS content_hash,
       jsonb_array_length(dataset->'records') AS parsed_records
FROM ocean_intel.runs r
CROSS JOIN LATERAL jsonb_each(r.payload#>'{ieaDatasets,datasets}') d(dataset_key, dataset)
WHERE r.id = 'current';

SELECT dataset->>'filename' AS filename,
       record->>'object' AS subject,
       record->>'metric' AS metric,
       record->>'value' AS value,
       record->>'unit' AS unit,
       record->>'sheet' AS sheet,
       record->>'cell' AS cell,
       record#>>'{classification,status}' AS classification_status,
       record#>>'{classification,primary}' AS industry
FROM ocean_intel.runs r
CROSS JOIN LATERAL jsonb_each(r.payload#>'{ieaDatasets,datasets}') d(dataset_key, dataset)
CROSS JOIN LATERAL jsonb_array_elements(dataset->'records') record
WHERE r.id = 'current'
  AND record#>>'{classification,status}' = 'accepted'
LIMIT 100;

-- 6. 文章指标通过 documentId 关联文档，通过 evidenceIds 关联原文摘录。
SELECT o.id AS observation_id,
       o.payload->>'name' AS metric,
       o.payload->>'subject' AS subject,
       o.payload->>'rawValue' AS raw_value,
       o.payload->>'unit' AS unit,
       o.payload->>'nature' AS nature,
       o.payload->>'period' AS period,
       d.payload->>'title' AS article_title,
       d.payload->>'url' AS article_url,
       e.payload->>'quote' AS evidence_quote
FROM ocean_intel.observations o
LEFT JOIN ocean_intel.documents d ON d.id = o.payload->>'documentId'
LEFT JOIN LATERAL jsonb_array_elements_text(o.payload->'evidenceIds') eid(id) ON true
LEFT JOIN ocean_intel.evidence e ON e.id = eid.id
LIMIT 30;

-- 相关上游：public.articles / article_chunks、mp2rss.items / versions /
-- evidence_documents、classification.articles / jobs。
-- ocean_research 保存研究版本与索引，不是本页统计序列的主存储。
-- 数据库 knowledge_base_before_tencent_20261015 是备份，当前应用不连接它。
-- 文件副本和原件：/opt/ocean-intelligence/data/snapshot.json、ver_*.html、
-- /opt/ocean-intelligence/data/iea/archive/<contentHash>.xlsx。

COMMIT;

-- 2026-10-17：数据明细工作台的人工修订与回收站。
-- data_overrides 每条记录保存原值、修改字段、删除标记及最近变更历史；
-- 导入新快照时重新应用这些修订，避免采集覆盖人工修改或恢复已删除记录。
-- 当前有效记录同时更新 runs.current，七张独立业务表的删除采用 insightDeleted 标记。
-- 统计点、登记条目和官方工作簿记录仍保存在 runs.payload 对应 JSON 数组中。
SELECT id,
       payload->>'kind' AS data_kind,
       payload->>'deleted' AS in_recycle_bin,
       payload->'patch' AS corrected_fields,
       payload->>'updatedAt' AS last_changed_at
FROM ocean_intel.data_overrides
ORDER BY updated_at DESC
LIMIT 100;

-- 完整的人工修改流水独立追加保存；文档历史版本和原始附件保留。
SELECT id,
       payload->>'kind' AS data_kind,
       payload->>'action' AS action,
       payload->>'note' AS change_reason,
       payload->'fields' AS changed_fields,
       payload->>'at' AS changed_at
FROM ocean_intel.data_change_log
ORDER BY created_at DESC
LIMIT 100;
