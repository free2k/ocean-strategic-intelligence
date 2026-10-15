import {usePool} from '~/server/db';
import {cachedAudit} from '../../intelligence/classification-audit.mjs';
import {auditMetrics} from '../../intelligence/audit-metrics.mjs';
export default defineEventHandler(async () => auditMetrics(await cachedAudit(usePool())));
