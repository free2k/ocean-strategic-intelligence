export interface ParsedFileResult {
  columns: string[]
  data: Record<string, any>[]
  totalRows: number
  preview: Record<string, any>[] // 前5行
}

const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Composable for parsing uploaded Excel/CSV files into structured JSON data.
 *
 * All parsing happens client-side using the xlsx (SheetJS) library.
 * Supports .xlsx, .xls, and .csv formats.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export function useFileParser() {
  /**
   * Parse an uploaded file into structured data.
   *
   * @param file - The File object from a file input or drag-and-drop
   * @returns Parsed result with columns, data, totalRows, and preview
   * @throws Error if file format is unsupported, file is too large, or parsing fails
   */
  async function parseFile(file: File): Promise<ParsedFileResult> {
    // Validate file extension
    const fileName = file.name.toLowerCase();
    const extension = fileName.slice(fileName.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error('仅支持 .xlsx、.xls、.csv 格式');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('文件过大，请控制在 10MB 以内');
    }

    try {
      // 使用 Function 构造避免 Vite 静态分析 xlsx 的 import
      const loadXlsx = new Function('return import("xlsx")');
      const XLSX = await loadXlsx();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Use the first sheet
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('文件内容为空，请检查文件');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        throw new Error('文件内容为空，请检查文件');
      }

      // Extract column names from the first row's keys
      const columns = Object.keys(jsonData[0]);

      // Generate preview (first 5 rows)
      const preview = jsonData.slice(0, 5);

      return {
        columns,
        data: jsonData,
        totalRows: jsonData.length,
        preview,
      };
    } catch (error: any) {
      // Re-throw our own validation errors
      if (
        error.message === '文件内容为空，请检查文件' ||
        error.message === '仅支持 .xlsx、.xls、.csv 格式' ||
        error.message === '文件过大，请控制在 10MB 以内'
      ) {
        throw error;
      }
      // Wrap unexpected parsing errors
      throw new Error('文件解析失败，请确认文件未损坏');
    }
  }

  /**
   * Get a sample of data rows, defaulting to the first 20 rows.
   *
   * @param data - The full data array
   * @param maxRows - Maximum number of rows to return (default: 20)
   * @returns The first maxRows rows of data
   */
  function getSampleData(data: Record<string, any>[], maxRows: number = 20): Record<string, any>[] {
    return data.slice(0, maxRows);
  }

  return { parseFile, getSampleData };
}
