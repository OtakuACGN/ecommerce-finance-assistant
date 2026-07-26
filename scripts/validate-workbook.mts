import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const inputPath = path.resolve(
  process.argv[2] || path.join(process.cwd(), "output", "拼多多经营分析_2026-07-20.xlsx"),
);
if (!existsSync(inputPath)) {
  throw new Error(`工作簿不存在：${inputPath}`);
}

const workbook = XLSX.read(readFileSync(inputPath), {
  type: "buffer",
  cellDates: true,
});
const requiredSheets = ["经营汇总", "订单毛利", "账务类型", "待补SKU"];
const missingSheets = requiredSheets.filter(
  (sheetName) => !workbook.SheetNames.includes(sheetName),
);
const sheets = workbook.SheetNames.map((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const nonEmptyRows = rows.filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== ""),
  ).length;
  return {
    name: sheetName,
    rows: rows.length,
    columns: Math.max(0, ...rows.map((row) => row.length)),
    nonEmptyRows,
  };
});
const emptySheets = sheets.filter((sheet) => sheet.nonEmptyRows === 0);
const summarySheet = workbook.Sheets["经营汇总"];
const summaryRows = summarySheet
  ? (XLSX.utils.sheet_to_json(summarySheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][])
  : [];
const summaryText = summaryRows.flat().map(String).join("|");
const hasProfitMetric = /利润|毛利/.test(summaryText);
const hasRevenueMetric = /收入|实收/.test(summaryText);

const result = {
  inputPath,
  fileMb: Math.round((readFileSync(inputPath).byteLength / 1024 / 1024) * 10) / 10,
  sheetCount: sheets.length,
  missingSheets,
  emptySheets: emptySheets.map((sheet) => sheet.name),
  hasProfitMetric,
  hasRevenueMetric,
  sheets,
};
console.log(JSON.stringify(result, null, 2));

if (
  missingSheets.length ||
  emptySheets.length ||
  !hasProfitMetric ||
  !hasRevenueMetric
) {
  throw new Error("工作簿结构校验失败");
}
