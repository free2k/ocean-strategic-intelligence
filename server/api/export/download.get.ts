export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const format = (query.format as string) || 'markdown';

  if (format === 'docx') {
    throw createError({
      statusCode: 501,
      message: 'Word 格式导出暂未实现，请使用 Markdown 格式',
    });
  }

  // For markdown format, the frontend handles the download directly
  // This endpoint is a placeholder for future docx support
  throw createError({
    statusCode: 400,
    message: '请使用 POST /api/export/markdown 接口获取导出内容',
  });
});
