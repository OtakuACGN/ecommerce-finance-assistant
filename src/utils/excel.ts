import * as XLSX from "xlsx"
import { getBaseName, readLocalFile, writeLocalFile } from "./desktop"

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
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true })
    utf8Decoder.decode(bytes)
    return new TextDecoder("utf-8").decode(bytes)
  } catch {
    // Try GBK (common for Chinese Excel exports)
    try {
      const gbkDecoder = new TextDecoder("gbk", { fatal: true })
      gbkDecoder.decode(bytes)
      return new TextDecoder("gbk").decode(bytes)
    } catch {
      // Fallback: try GB18030 (more complete Chinese encoding)
      return new TextDecoder("gb18030").decode(bytes)
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
    ["运单号", "合计费用", "运费"],
    ["运单号", "面单费用", "运费"],
    ["运单号", "预付面单", "运费"],
    ["运单号", "揽收时间", "运费"],
    ["运单号", "店铺名称", "运费"],
    ["运单号", "订单目的地省份", "重量"],
    ["运单号", "物料网点", "运费"],
    ["运单号", "发货时间", "订单号"],
    ["运单号", "快递", "订单号"],
    ["运单号", "物流单号", "订单号"],
    ["快递单号", "运费", "重量"],
    ["售后编号", "退款金额", "退款原因"],
    ["售后编号", "订单编号", "退款类型"],
    ["售后单号", "售后原因", "售后描述"],
    ["售后单号", "平台订单号", "申请退款金额"],
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

/** 表头业务相关度：优先明细（运单/运费）而非汇总页 */
function scoreSheetHeaders(headers: string[], sheetName: string): number {
  const joined = headers.map((h) => String(h || "")).join("|")
  let score = 0
  if (joined.includes("运单号") || joined.includes("快递单号")) score += 12
  if (joined.includes("合计费用") || joined.includes("运费") || joined.includes("面单") || joined.includes("预付面单"))
    score += 8
  if (joined.includes("揽收时间") || joined.includes("物料网点") || joined.includes("订单目的地"))
    score += 4
  if (joined.includes("发货时间")) score += 6
  if (joined.includes("订单号")) score += 4
  if (joined.includes("商家实收") || joined.includes("商品名称")) score += 3
  if (joined.includes("售后编号") || joined.includes("退款原因") || joined.includes("售后单号") || joined.includes("售后原因")) score += 10
  if (joined.includes("售后描述")) score += 6
  if ((joined.includes("退款类型") || joined.includes("售后类型")) && (joined.includes("退款金额") || joined.includes("申请退款金额"))) score += 8
  if (joined.includes("网点称重") || joined.includes("目的省份")) score += 4
  const name = String(sheetName || "")
  if (/明细|detail/i.test(name)) score += 15
  if (/汇总|summary|合计/i.test(name)) score -= 8
  const nonEmpty = headers.filter((h) => String(h || "").trim()).length
  score += Math.min(nonEmpty, 20) * 0.2
  return score
}

function pickBestSheet(workbook: XLSX.WorkBook): { sheetName: string; rows: any[][] } {
  const names = workbook.SheetNames || []
  if (!names.length) {
    return { sheetName: "", rows: [] }
  }
  let bestName = names[0]
  let bestRows: any[][] = []
  let bestScore = -Infinity
  for (const name of names) {
    const ws = workbook.Sheets[name]
    if (!ws) continue
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    if (!raw.length) continue
    const headerIdx = findLikelyHeaderRow(raw)
    const data = headerIdx > 0 ? raw.slice(headerIdx) : raw
    const headers = (data[0] || []).map((h: any) => String(h || ""))
    const score = scoreSheetHeaders(headers, name)
    if (score > bestScore) {
      bestScore = score
      bestName = name
      bestRows = data
    }
  }
  if (bestScore < 1) {
    const first = names[0]
    const ws = workbook.Sheets[first]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    const headerIdx = findLikelyHeaderRow(raw)
    return {
      sheetName: first,
      rows: headerIdx > 0 ? raw.slice(headerIdx) : raw,
    }
  }
  return { sheetName: bestName, rows: bestRows }
}

function isCSV(filePath: string): boolean {
  return /\.(csv|CSV)$/.test(filePath)
}

export async function processFile(filePath: string): Promise<FileData | null> {
  try {
    const result = await readLocalFile(filePath)
    if (!result.success || !result.buffer) {
      console.error("读取文件失败:", result.error)
      return null
    }

    let data: any[][]
    if (isCSV(filePath)) {
      const content = detectAndDecodeBuffer(result.buffer)
      const workbook = XLSX.read(content, { type: "string" })
      data = pickBestSheet(workbook).rows
    } else {
      // Excel: 自动挑选明细表（如快递账单「明细」优先于「汇总」）
      const workbook = XLSX.read(result.buffer, { type: "array" })
      data = pickBestSheet(workbook).rows
    }

    if (!data || data.length === 0) {
      return null
    }

    const headers = (data[0] || []).map((h: any) => String(h || ""))

    return {
      name: getBaseName(filePath),
      path: filePath,
      headers,
      data,
    }
  } catch (error) {
    console.error("处理文件失败:", error)
    return null
  }
}

/**
 * xlsx 的 type:'array' 在不同环境下可能是 number[] 或 Uint8Array。
 * 直接取 .buffer 会得到 undefined 或整段 SharedBuffer，导致导出空文件。
 */
export function xlsxOutputToArrayBuffer(
  output: ArrayBuffer | Uint8Array | number[],
): ArrayBuffer {
  if (output instanceof ArrayBuffer) {
    return output
  }
  const u8 =
    output instanceof Uint8Array
      ? output
      : Uint8Array.from(output as number[])
  // copy to a pure ArrayBuffer (avoid SharedArrayBuffer typing issues)
  const copy = new Uint8Array(u8.byteLength)
  copy.set(u8)
  return copy.buffer
}

/** 将二维表写入 xlsx（单表） */
export async function exportToExcel(data: any[][], filePath: string): Promise<void> {
  if (!data || data.length === 0) {
    throw new Error("导出数据为空")
  }
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "数据")
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const ab = xlsxOutputToArrayBuffer(output as any)
  if (!ab || ab.byteLength < 32) {
    throw new Error("生成 Excel 失败（内容为空）")
  }
  await writeLocalFile(filePath, ab)
}

export type WorkbookSheet = {
  name: string
  data: any[][]
  /** 0-based data row indexes (excluding header) to mark as pending */
  highlightRowIndexes?: number[]
}

/** 多工作表导出 */
export async function exportWorkbook(
  sheets: Array<WorkbookSheet>,
  filePath: string,
): Promise<void> {
  if (!sheets.length) throw new Error("没有可导出的工作表")
  const workbook = XLSX.utils.book_new()
  for (const s of sheets) {
    const rows = s.data || []
    if (!rows.length) {
      // 至少写一个空表头占位，避免空白表
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["(空表)"]]),
        (s.name || "Sheet").slice(0, 31),
      )
      continue
    }
    // 待填行：社区版 xlsx 无可靠填色，用首列标记 + 排序/独立 sheet 保证可见
    let sheetRows = rows
    const hi = s.highlightRowIndexes || []
    if (hi.length && rows.length > 1) {
      const markSet = new Set(hi)
      const header = [...(rows[0] || [])]
      const hasMarkCol = header.some((h) => String(h).includes("填写标记") || String(h) === "标记")
      if (!hasMarkCol) {
        header.unshift("填写标记")
      }
      const body = rows.slice(1).map((row, idx) => {
        const r = [...(row || [])]
        if (!hasMarkCol) r.unshift(markSet.has(idx) ? "⚠待填" : "")
        else if (markSet.has(idx)) {
          const cur = String(r[0] ?? "")
          if (!cur.includes("待填")) r[0] = cur ? `⚠待填 ${cur}` : "⚠待填"
        }
        return r
      })
      // 待填行沉底到顶部（标记列非空优先）
      body.sort((a, b) => {
        const am = String(a[0] ?? "").includes("待填") ? 0 : 1
        const bm = String(b[0] ?? "").includes("待填") ? 0 : 1
        return am - bm
      })
      sheetRows = [header, ...body]
    }
    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    const colCount = Math.max(...sheetRows.map((r) => (r ? r.length : 0)), 1)
    ws["!cols"] = Array.from({ length: colCount }, (_, i) => ({
      wch: i === 0 && hi.length ? 10 : i < 4 ? 16 : i < 12 ? 12 : 10,
    }))
    // 冻结表头，方便填成本时对照
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" }
    if (!(ws as any)["!views"]) {
      ;(ws as any)["!views"] = [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }]
    }
    XLSX.utils.book_append_sheet(workbook, ws, (s.name || "Sheet").slice(0, 31))
  }
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const ab = xlsxOutputToArrayBuffer(output as any)
  if (!ab || ab.byteLength < 32) {
    throw new Error("生成 Excel 失败（内容为空）")
  }
  await writeLocalFile(filePath, ab)
}

export async function exportToCSV(
  data: any[][],
  filePath: string,
  _encoding: "utf-8" | "gbk" = "utf-8",
  delimiter: string = ",",
): Promise<void> {
  const csv = data
    .map((row) =>
      row
        .map((cell) => {
          const str = cell === null || cell === undefined ? "" : String(cell)
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(delimiter),
    )
    .join("\n")

  // Always use UTF-8 with BOM for Excel compatibility
  const bom = "\ufeff"
  const encoded = new TextEncoder().encode(bom + csv)
  const copy = new Uint8Array(encoded.byteLength)
  copy.set(encoded)
  await writeLocalFile(filePath, copy.buffer)
}
