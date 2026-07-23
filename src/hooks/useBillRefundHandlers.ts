import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FileData } from "../utils/excel";
import { processFile, exportToExcel } from "../utils/excel";
import { openDataFiles, saveDataFile } from "../utils/desktop";
import type {
  BillRecord,
  RefundOrder,
  CommissionDetail,
} from "../services/businessLogic";
import {
  parseBill,
  parseCommissionDetails,
  findCol,
  findAmount,
  detectPlatform,
} from "../services/businessLogic";
import type { PddBillLine } from "../services/pddBusiness";
import { ingestForOperating } from "../services/pddBusiness";
import {
  buildAccrualTable,
  buildRefundLossTable,
  avgCommissionRateFromBills,
} from "../services/billAccrual";
import type { ToastMessage } from "../components/Toast";

type ShowToast = (message: string, type?: ToastMessage["type"]) => void;

export interface BillRefundHandlerDeps {
  billRecords: BillRecord[];
  setBillRecords: Dispatch<SetStateAction<BillRecord[]>>;
  setOpBillLines: Dispatch<SetStateAction<PddBillLine[]>>;
  commissionDetails: CommissionDetail[];
  setCommissionDetails: Dispatch<SetStateAction<CommissionDetail[]>>;
  refundRecords: RefundOrder[];
  setRefundRecords: Dispatch<SetStateAction<RefundOrder[]>>;
  setRefundFile: Dispatch<SetStateAction<FileData | null>>;
  refundLossData: any[][];
  setRefundLossData: Dispatch<SetStateAction<any[][]>>;
  setAccrualData: Dispatch<SetStateAction<any[][]>>;
  setCurrentData: Dispatch<SetStateAction<any[][]>>;
  setCurrentHeaders: Dispatch<SetStateAction<string[]>>;
  saveHistory: (data: any[][], headers: string[]) => void;
  showToast: ShowToast;
  reportError: (action: string, error: unknown) => void;
}

export function useBillRefundHandlers(deps: BillRefundHandlerDeps) {
  const {
    billRecords,
    setBillRecords,
    setOpBillLines,
    commissionDetails,
    setCommissionDetails,
    refundRecords,
    setRefundRecords,
    setRefundFile,
    refundLossData,
    setRefundLossData,
    setAccrualData,
    setCurrentData,
    setCurrentHeaders,
    saveHistory,
    showToast,
    reportError,
  } = deps;

  const handleImportBill = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        for (const filePath of result.filePaths) {
          const fileData = await processFile(filePath);
          if (!fileData) continue;
          const ingested = ingestForOperating(fileData);
          if (ingested.kind === "pdd_bill" && ingested.billRecord) {
            setBillRecords((prev) => [...prev, ingested.billRecord!]);
            setOpBillLines((prev) => [...prev, ...ingested.billLines]);
            showToast(
              `已识别拼多多账务明细：${ingested.billLines.length} 行流水`,
              "success",
            );
          } else {
            const record = parseBill(ingested.normalized);
            setBillRecords((prev) => [...prev, record]);
          }
        }
      }
    } catch (error) {
      reportError("导入账单", error);
    }
  }, [reportError, setBillRecords, setOpBillLines, showToast]);

  const handleImportCommissionDetails = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          const details = parseCommissionDetails(fileData);
          if (details.length === 0) {
            showToast("未找到佣金数据，请检查文件格式", "error");
            return;
          }
          setCommissionDetails(details);
          showToast(`已导入 ${details.length} 条佣金明细`, "success");
        }
      }
    } catch (error) {
      reportError("导入佣金明细", error);
    }
  }, [reportError, setCommissionDetails, showToast]);

  const handleGenerateAccrual = useCallback(() => {
    if (billRecords.length === 0) return;
    const data = buildAccrualTable(billRecords);
    const headers = (data[0] || []).map(String);
    setAccrualData(data);
    setCurrentData(data);
    setCurrentHeaders(headers);
    saveHistory(data, headers);
  }, [billRecords, saveHistory, setAccrualData, setCurrentData, setCurrentHeaders]);

  const handleRemoveBill = useCallback(
    (idx: number) => setBillRecords((prev) => prev.filter((_, i) => i !== idx)),
    [setBillRecords],
  );

  const handleImportRefund = useCallback(async () => {
    try {
      const result = await openDataFiles();
      if (!result.canceled && result.filePaths.length > 0) {
        const fileData = await processFile(result.filePaths[0]);
        if (fileData) {
          setRefundFile(fileData);
          const headers = fileData.headers;
          const rows = fileData.data.slice(1);
          const idCol = findCol(headers, ["订单号", "order", "编号", "id"]);
          const amtCol = findCol(headers, ["退款", "refund", "金额", "amount"]);
          const dateCol = findCol(headers, ["日期", "time", "date", "时间"]);
          const platformCol = findCol(headers, ["平台", "source", "渠道"]);
          const avgCommRate = avgCommissionRateFromBills(billRecords);
          const records: RefundOrder[] = rows.map((row) => {
            const refundAmount =
              amtCol >= 0 ? Math.abs(findAmount([row[amtCol]])) : 0;
            return {
              platform:
                platformCol >= 0
                  ? String(row[platformCol] || detectPlatform(fileData.name))
                  : detectPlatform(fileData.name),
              orderId: idCol >= 0 ? String(row[idCol] || "") : "",
              refundAmount,
              refundDate: dateCol >= 0 ? String(row[dateCol] || "") : "",
              commissionLost: refundAmount * avgCommRate,
            };
          });
          setRefundRecords(records);
        }
      }
    } catch (error) {
      reportError("导入退款单", error);
    }
  }, [billRecords, reportError, setRefundFile, setRefundRecords]);

  const handleGenerateRefundLoss = useCallback(() => {
    if (refundRecords.length === 0) return;
    const { table } = buildRefundLossTable(
      refundRecords,
      commissionDetails,
      billRecords,
    );
    const headers = (table[0] || []).map(String);
    setRefundLossData(table);
    setCurrentData(table);
    setCurrentHeaders(headers);
    saveHistory(table, headers);
  }, [
    refundRecords,
    commissionDetails,
    billRecords,
    saveHistory,
    setRefundLossData,
    setCurrentData,
    setCurrentHeaders,
  ]);

  const handleExportRefundLoss = useCallback(async () => {
    if (refundLossData.length === 0) return;
    try {
      const result = await saveDataFile(
        `退款损失还原_${new Date().toISOString().slice(0, 7)}.xlsx`,
      );
      if (!result.canceled && result.filePath)
        await exportToExcel(refundLossData, result.filePath);
    } catch (error) {
      reportError("导出退款损失表", error);
    }
  }, [refundLossData, reportError]);

  return {
    handleImportBill,
    handleImportCommissionDetails,
    handleGenerateAccrual,
    handleRemoveBill,
    handleImportRefund,
    handleGenerateRefundLoss,
    handleExportRefundLoss,
  };
}
