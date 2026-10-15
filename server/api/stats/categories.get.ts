import {usePool} from '~/server/db';
import {cachedAudit} from '../../../intelligence/classification-audit.mjs';
import {auditMetrics} from '../../../intelligence/audit-metrics.mjs';
export default defineEventHandler(async () => {const m=auditMetrics(await cachedAudit(usePool()));return {...m.categories,observedAt:m.observedAt,metricVersion:m.metricVersion};});
