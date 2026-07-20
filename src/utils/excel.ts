import * as XLSX from 'xlsx'
import { getBaseName, readLocalFile, writeLocalFile } from './desktop'

export interface FileData {
  name: string
  path: string
  headers: string[]
  data: any[][]
}

function detectAndDecodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  // Try UTF-8 first
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
    utf8Decoder.decode(bytes)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    // Try GBK (common for Chinese Excel exports)
    try {
      const gbkDecoder = new TextDecoder('gbk', { fatal: true })
      gbkDecoder.decode(bytes)
      return new TextDecoder('gbk').decode(bytes)
    } catch {
      // Fallback: try GB18030 (more complete Chinese encoding)
      return new TextDecoder('gb18030').decode(bytes)
    }
  }
}


function findLikelyHeaderRow(rows: any[][]): number {
  const patterns: string[][] = [
    ["商户订单号", "发生时间", "账务类型"],
    ["订单号", "商家实收", "商品"],
    ["商品编码", "商品名称", "规格"],
    ["日期", "成交花费", "交易额"],
    ["日期", "总花费", "交易额"],
  ]
  const limit = Math.min(rows.length, 30)
  for (let i = 0; i < limit; i++) {
    const joined = (rows[i] || []).map((c) => String(c ?? "")).join("|")
    for (const keys of patterns) {
      const hit = keys.filter((k) => joined.includes(k)).length
      if (hit >= 2) return i
    }
  }
  return 0
}

function isCSV(filePath: string): boolean {
  return /\.(csv|CSV)$/.test(filePath)
}

export async function processFile(filePath: string): Promise<FileData | null> {
  try {
    const result = await readLocalFile(filePath)
    if (!result.success || !result.buffer) {
      console.error('读取文件失败:', result.error)
      return null
    }

    let jsonData: any[][]
    if (isCSV(filePath)) {
      // CSV files: decode with encoding detection, then parse
      const content = detectAndDecodeBuffer(result.buffer)
      const workbook = XLSX.read(content, { type: 'string' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    } else {
      // Excel files: read binary directly
      const workbook = XLSX.read(result.buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    }
    
    if (jsonData.length === 0) {
      return null
    }

    // Skip platform export preambles (e.g. PDD bill title rows)
    const headerIdx = findLikelyHeaderRow(jsonData)
    const data = headerIdx > 0 ? jsonData.slice(headerIdx) : jsonData
    const headers = (data[0] || []).map((h: any) => String(h || ''))
    
    return {
      name: getBaseName(filePath),
      path: filePath,
      headers,
      data
    }
  } catch (error) {
    console.error('处理文件失败:', error)
    return null
  }
}

export async function exportToExcel(data: any[][], filePath: string): Promise<void> {
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '数据')
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  await writeLocalFile(filePath, output.buffer)
}

export async function exportToCSV(
  data: any[][],
  filePath: string,
  _encoding: "utf-8" | "gbk" = "utf-8",
  delimiter: string = ","
): Promise<void> {
  const csv = data.map(row =>
    row.map(cell => {
      const str = cell === null || cell === undefined ? "" : String(cell);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(delimiter)
  ).join("\n");

  // Always use UTF-8 with BOM for Excel compatibility
  const bom = "\ufeff";
  const buffer = new TextEncoder().encode(bom + csv);
  await writeLocalFile(filePath, buffer.buffer);
}
