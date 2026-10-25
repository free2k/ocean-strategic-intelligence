import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// Existing public-source workbooks remain readable while either research web
// process is stopped. Site auth middleware protects this shared download.
export default defineEventHandler(async (event) => {
  const hash = String(getQuery(event).hash || '');
  if (!/^[a-f0-9]{64}$/.test(hash)) throw createError({ statusCode: 404, message: '文件不存在' });
  const file = '/opt/ocean-intelligence/data/iea/archive/' + hash + '.xlsx';
  if (!await stat(file).then(s => s.isFile(), () => false)) throw createError({ statusCode: 404, message: '文件不存在' });
  setResponseHeaders(event, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="IEA-' + hash.slice(0, 12) + '.xlsx"', 'Cache-Control': 'private, no-store' });
  return sendStream(event, createReadStream(file));
});
