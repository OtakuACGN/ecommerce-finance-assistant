# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

店财通 (DianCaiTong) — ecommerce finance desktop app (Electron + React + TypeScript) for processing CSV/Excel files from e-commerce platforms (淘宝, 京东, 抖音, 拼多多, 天猫, 快手). Supports deduplication, merging, format standardization, SKU mapping, payment reconciliation, bill analysis, refund loss calculation, and tiered brand rebate computation.

## Commands

```bash
npm run dev      # Start development server with hot reload
npm run build    # Production build (Vite + electron-builder)
npm run preview  # Preview production build
```

- Build output: `dist/` (renderer), `dist-electron/` (main + preload)
- Build skips code signing (`"sign": false` in electron-builder config)

## Architecture

### Electron Process Model

- **Main process** (`electron/main.ts`): Window creation, file dialogs, native file read/write via `fs`
- **Preload script** (`electron/preload.ts`): Exposes `electronAPI` via `contextBridge` for secure IPC
- **Renderer** (`src/`): React app with no direct Node.js access

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `dialog:openFile` | renderer→main | Open file picker (multi-select CSV/XLSX/XLS) |
| `dialog:saveFile` | renderer→main | Save file dialog |
| `file:read` | renderer→main | Read file as ArrayBuffer |
| `file:write` | renderer→main | Write file from string/ArrayBuffer |

### State Management

All state lives in `App.tsx` via React `useState`. No external state library. Key state clusters:

- **File state**: `files[]`, `selectedFileIndex`, `currentData`, `currentHeaders`, `mergedData`
- **History**: undo stack via `history[]` / `historyIndex`
- **Tab-specific**: `billRecords`, `refundRecords`, `skuMappings`, `rebateResult`, `orderStats`
- **UI**: `activeTab`, `searchText`

### Data Flow

1. File selected via `electronAPI.openFile()` → `processFile()` in `src/utils/excel.ts` parses via `xlsx` library
2. `FileData` interface: `{ name, path, headers, data: any[][] }`
3. Operating analysis state lives in `opOrders` / `opProducts` / `opAds` / `opReport`
4. Report tables are shown via `currentData` + `DataTable`
5. Export uses `exportToExcel` / `exportWorkbook` + `electronAPI.writeFile()`

### Platform Detection

`detectPlatform()` in App.tsx auto-detects platform from filename (taobao/淘宝 → 淘宝, jd/京东 → 京东, etc.). Used for bill parsing and order stats.

## Build Configuration

- **Vite plugins**: `vite-plugin-electron` (compiles main/preload), `vite-plugin-electron-renderer`, `vite-plugin-node-polyfills` (provides Buffer polyfill for xlsx)
- **TypeScript**: Strict mode, `moduleResolution: bundler`
- **Styling**: Tailwind CSS v3 with PostCSS
- **Paths alias**: `@/*` maps to `src/*`

## File Structure

```
electron/
  main.ts        # Main process (window, IPC handlers, file ops)
  preload.ts     # contextBridge API exposure

src/
  App.tsx        # Main React component with all tab logic (~1000 lines)
  main.tsx       # React entry point
  utils/excel.ts # processFile, exportToExcel, exportToCSV
  components/
    DataTable.tsx
        MonthlySummary.tsx
    StatusBar.tsx
    StatCard.tsx
OpViewNav.tsx
```

## Key Implementation Notes

- **xlsx usage**: `XLSX.read(buffer, { type: 'array' })`, `sheet_to_json(worksheet, { header: 1 })` returns `any[][]`
- **Undo system**: Every mutation calls `saveHistory()` which slices history stack and pushes new state. `handleUndo()` restores previous index.
- **Bill parsing**: `parseBill()` uses `findCol()` to locate columns by keyword matching against headers
- **Refund loss**: Calculates commission loss using average commission rate from imported bills (defaults to 5% if no bills)
- **Rebate calculation**: `calculateRebate()` applies tiered rates progressively (累进计算)
- **CSV export**: Prepends UTF-8 BOM (`\ufeff`) for Excel compatibility
