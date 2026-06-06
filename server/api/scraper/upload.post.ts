import { useDB, schema } from '~/server/db';
import { eq } from 'drizzle-orm';

/**
 * POST /api/scraper/upload
 * 上传 Excel/CSV 文件，解析后存入 scraped_data 表
 */
export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event);
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: '未收到文件' });
  }

  // 获取 sourceId
  const sourceIdField = formData.find(f => f.name === 'sourceId');
  const sourceId = sourceIdField ? Number(sourceIdField.data.toString()) : 0;
  if (!sourceId) throw createError({ statusCode: 400, message: '缺少 sourceId' });

  // 获取文件
  const fileField = formData.find(f => f.name === 'file');
  if (!fileField || !fileField.data) {
    throw createError({ statusCode: 400, message: '未收到文件内容' });
  }

  const fileName = fileField.filename || 'upload.xlsx';
  const ext = fileName.toLowerCase().split('.').pop();

  if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
    throw createError({ statusCode: 400, message: '仅支持 xlsx、xls、csv 格式' });
  }

  try {
    // 动态导入 xlsx
    const loadXlsx = new Function('return import("xlsx")');
    const XLSX = await loadXlsx();

    let data: Record<string, any>[] = [];
    let columns: string[] = [];

    if (ext === 'csv') {
      const text = fileField.data.toString('utf-8');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV 内容为空');

      const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
      columns = lines[0].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());

      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
        const row: Record<string, any> = {};
        cells.forEach((cell, idx) => {
          const key = columns[idx] || `col_${idx}`;
          const num = Number(cell.replace(/,/g, ''));
          row[key] = isNaN(num) || cell === '' ? cell : num;
        });
        data.push(row);
      }
    } else {
      // Excel
      const workbook = XLSX.read(fileField.data, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) throw new Error('Excel 文件内容为空');

      columns = Object.keys(jsonData[0]);
      data = jsonData.map((row: Record<string, any>) => {
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'number') {
            cleaned[key] = value;
          } else if (typeof value === 'string') {
            const num = Number(value.replace(/,/g, ''));
            cleaned[key] = isNaN(num) || value === '' ? value : num;
          } else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      });
    }

    // 存入数据库
    const db = useDB();
    await db.insert(schema.scrapedData).values({
      sourceId,
      data,
      columns,
      rowCount: data.length,
    });

    // 更新数据源状态
    await db.update(schema.scrapeSources)
      .set({ lastScrapedAt: new Date(), lastStatus: 'success', lastError: null })
      .where(eq(schema.scrapeSources.id, sourceId));

    return { success: true, rowCount: data.length, columns };
  } catch (error: any) {
    throw createError({ statusCode: 500, message: `文件解析失败: ${error.message}` });
  }
});
