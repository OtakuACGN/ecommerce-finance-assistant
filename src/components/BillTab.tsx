import DataTable from "./DataTable";
import { exportToExcel } from "../utils/excel";
import { saveDataFile } from "../utils/desktop";
import type { BillRecord, RefundOrder } from "../services/businessLogic";

export interface BillTabProps {
  billRecords: BillRecord[];
  refundRecords: RefundOrder[];
  refundLossData: any[][];
  commissionDetails: unknown[];
  accrualData: any[][];
  desktopReady: boolean;
  showBillDetail: BillRecord | null;
  setShowBillDetail: (b: BillRecord | null) => void;
  onImportBill: () => void;
  onImportCommission: () => void;
  onGenerateAccrual: () => void;
  onImportRefund: () => void;
  onGenerateRefundLoss: () => void;
  onExportRefundLoss: () => void;
  onRemoveBill: (idx: number) => void;
  onError: (label: string, error: unknown) => void;
}

export default function BillTab(props: BillTabProps) {
  const {
    billRecords,
    refundRecords,
    refundLossData,
    commissionDetails,
    accrualData,
    desktopReady,
    showBillDetail,
    setShowBillDetail,
    onImportBill,
    onImportCommission,
    onGenerateAccrual,
    onImportRefund,
    onGenerateRefundLoss,
    onExportRefundLoss,
    onRemoveBill,
    onError,
  } = props;

  const platformColor: Record<string, string> = {
    淘宝: "bg-orange-100 text-orange-700",
    天猫: "bg-red-100 text-red-700",
    京东: "bg-blue-100 text-blue-700",
    抖音电商: "bg-pink-100 text-pink-700",
    快手电商: "bg-purple-100 text-purple-700",
    拼多多: "bg-yellow-100 text-yellow-700",
  };
  const color = (p: string) => platformColor[p] || "bg-gray-100 text-gray-700";
  const reportError = onError;

  // body injected below uses original names via aliases
  const handleImportBill = onImportBill;
  const handleImportCommissionDetails = onImportCommission;
  const handleGenerateAccrual = onGenerateAccrual;
  const handleImportRefund = onImportRefund;
  const handleGenerateRefundLoss = onGenerateRefundLoss;
  const handleExportRefundLoss = onExportRefundLoss;
  const handleRemoveBill = onRemoveBill;

  return (
    <>
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* 账单列表 */}
          <div className="bg-white rounded-xl shadow">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">📄 平台账单</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  导入各平台月末账单，自动解析佣金/扣点/补贴
                </p>
              </div>
              <button
                onClick={handleImportBill}
                disabled={!desktopReady}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-40"
              >
                + 导入账单
              </button>
            </div>
            {billRecords.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm">暂无账单</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {[
                        "平台",
                        "文件名",
                        "账期",
                        "账单金额",
                        "订单数",
                        "佣金",
                        "技术服务费",
                        "补贴",
                        "净收款",
                        "操作",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {billRecords.map((b, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${color(b.platform)}`}
                          >
                            {b.platform}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[120px] truncate">
                          {b.fileName}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {b.date}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          ¥{b.totalAmount.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {b.orderCount}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          -¥{b.commission.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-orange-600">
                          -¥{b.techFee.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-600">
                          +¥{b.subsidy.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-700">
                          ¥{b.netAmount.toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setShowBillDetail(b)}
                            className="text-xs text-blue-600 hover:underline mr-2"
                          >
                            查看
                          </button>
                          <button
                            onClick={() => handleRemoveBill(i)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            移除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {billRecords.length > 1 && (
                    <tfoot className="bg-gray-50 font-bold">
                      <tr>
                        <td
                          className="px-4 py-2.5 text-xs text-gray-500"
                          colSpan={3}
                        >
                          合计 ({billRecords.length}个平台)
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          ¥
                          {billRecords
                            .reduce((s, b) => s + b.totalAmount, 0)
                            .toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {billRecords.reduce((s, b) => s + b.orderCount, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-red-600">
                          -¥
                          {billRecords
                            .reduce((s, b) => s + b.commission, 0)
                            .toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-orange-600">
                          -¥
                          {billRecords
                            .reduce((s, b) => s + b.techFee, 0)
                            .toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-600">
                          +¥
                          {billRecords
                            .reduce((s, b) => s + b.subsidy, 0)
                            .toFixed(0)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-blue-700">
                          ¥
                          {billRecords
                            .reduce((s, b) => s + b.netAmount, 0)
                            .toFixed(0)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* 佣金计提 */}
          {billRecords.length > 0 && (
            <div className="bg-white rounded-xl shadow">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800">
                    📊 佣金自动计提表
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    根据账单自动生成佣金/扣点计提数据
                    {commissionDetails.length > 0 && (
                      <span className="ml-2 text-green-600">
                        ✓ 已导入 {commissionDetails.length} 条佣金明细
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateAccrual}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                  >
                    🔄 重新生成
                  </button>
                  <button
                    onClick={handleImportCommissionDetails}
                    disabled={!desktopReady}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm disabled:opacity-40"
                  >
                    📋 导入佣金明细
                  </button>
                  {accrualData.length > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const result = await saveDataFile(
                            `佣金计提表_${new Date().toISOString().slice(0, 7)}.xlsx`,
                          );
                          if (!result.canceled && result.filePath)
                            await exportToExcel(accrualData, result.filePath);
                        } catch (error) {
                          reportError("导出佣金计提表", error);
                        }
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      📥 导出Excel
                    </button>
                  )}
                </div>
              </div>
              {accrualData.length > 0 ? (
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-sm">
                    <thead className="bg-purple-50">
                      <tr>
                        {accrualData[0].map((h: string, i: number) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left text-xs text-purple-700 font-medium whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {accrualData.slice(1).map((row: any[], i: number) => (
                        <tr
                          key={i}
                          className={`border-t ${i === accrualData.length - 2 ? "bg-yellow-50 font-medium" : ""}`}
                        >
                          {row.map((cell: any, j: number) => (
                            <td
                              key={j}
                              className={`px-3 py-2 text-xs ${j >= 2 && j <= 7 && typeof cell === "string" && cell.startsWith("-") ? "text-red-600" : ""}`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400 text-sm">
                  点击「重新生成」
                </div>
              )}
            </div>
          )}

          {/* 退款损失还原 */}
          <div className="bg-white rounded-xl shadow">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">
                  🔴 退款损失还原
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {commissionDetails.length > 0
                    ? "已导入佣金明细，可精确计算退款损失"
                    : "导入佣金明细文件后可精确计算损失，否则使用估算"}
                </p>
              </div>
              <button
                onClick={handleImportRefund}
                disabled={!desktopReady}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm disabled:opacity-40"
              >
                + 导入退款单
              </button>
            </div>
            <div className="p-4">
              {refundRecords.length === 0 ? (
                <div className="text-center text-gray-400 py-6 text-sm">
                  导入退款单后自动计算佣金损失
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-3 text-xs">
                    <span className="bg-red-50 px-3 py-1.5 rounded">
                      退款笔数: <strong>{refundRecords.length}</strong>
                    </span>
                    <span className="bg-red-50 px-3 py-1.5 rounded">
                      退款总额:{" "}
                      <strong>
                        ¥
                        {refundRecords
                          .reduce((s, r) => s + r.refundAmount, 0)
                          .toFixed(2)}
                      </strong>
                    </span>
                    <span className="bg-orange-50 px-3 py-1.5 rounded">
                      预估佣金损失:{" "}
                      <strong>
                        ¥
                        {(
                          refundRecords.reduce(
                            (s, r) => s + r.refundAmount,
                            0,
                          ) *
                          (billRecords.length > 0
                            ? billRecords.reduce(
                                (s, b) => s + b.commission,
                                0,
                              ) /
                              Math.max(
                                1,
                                billRecords.reduce(
                                  (s, b) => s + b.totalAmount,
                                  0,
                                ),
                              )
                            : 0.05)
                        ).toFixed(2)}
                      </strong>
                    </span>
                  </div>
                  {commissionDetails.length > 0 && refundRecords.length > 0 && (
                    <div className="bg-orange-50 px-3 py-1.5 rounded text-xs">
                      💡 已匹配 {commissionDetails.length} 条佣金明细，将用于精确计算
                    </div>
                  )}
                  {commissionDetails.length === 0 && refundRecords.length > 0 && (
                    <div className="bg-gray-100 px-3 py-1.5 rounded text-xs text-gray-600">
                      ⚠️ 未导入佣金明细，使用均摊估算
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleGenerateRefundLoss}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                    >
                      📊 生成退款损失表
                    </button>
                    {refundLossData.length > 0 && (
                      <button
                        onClick={handleExportRefundLoss}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        📥 导出
                      </button>
                    )}
                  </div>
                  {refundLossData.length > 0 && (
                    <div className="mt-3 overflow-x-auto max-h-60 border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-red-50">
                          <tr>
                            {refundLossData[0].map((h: string, i: number) => (
                              <th
                                key={i}
                                className="px-3 py-2 text-left text-red-700"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {refundLossData
                            .slice(1)
                            .map((row: any[], i: number) => (
                              <tr key={i} className="border-t">
                                {row.map((cell: any, j: number) => (
                                  <td
                                    key={j}
                                    className={`px-3 py-1.5 ${j >= 3 && j <= 5 ? "text-right text-red-600 font-medium" : ""}`}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    {showBillDetail && (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={() => setShowBillDetail(null)}
      >
        <div
          className="bg-white rounded-xl shadow-2xl w-[90vw] max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">
                {showBillDetail.fileName}
              </h3>
              <p className="text-xs text-gray-500">
                {showBillDetail.platform} · {showBillDetail.date}
              </p>
            </div>
            <button
              onClick={() => setShowBillDetail(null)}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="mb-4 flex gap-4 text-sm flex-wrap">
              <div className="bg-gray-50 rounded-lg px-4 py-2 text-center">
                <div className="text-xs text-gray-500">账单金额</div>
                <div className="font-bold text-lg">
                  ¥{showBillDetail.totalAmount.toFixed(2)}
                </div>
              </div>
              <div className="bg-red-50 rounded-lg px-4 py-2 text-center">
                <div className="text-xs text-gray-500">佣金</div>
                <div className="font-bold text-lg text-red-600">
                  -¥{showBillDetail.commission.toFixed(2)}
                </div>
              </div>
              <div className="bg-orange-50 rounded-lg px-4 py-2 text-center">
                <div className="text-xs text-gray-500">技术服务费</div>
                <div className="font-bold text-lg text-orange-600">
                  -¥{showBillDetail.techFee.toFixed(2)}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
                <div className="text-xs text-gray-500">补贴/返点</div>
                <div className="font-bold text-lg text-green-600">
                  +¥{showBillDetail.subsidy.toFixed(2)}
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
                <div className="text-xs text-gray-500">净收款</div>
                <div className="font-bold text-lg text-blue-700">
                  ¥{showBillDetail.netAmount.toFixed(2)}
                </div>
              </div>
            </div>
            <DataTable
              data={showBillDetail.rawData}
              headers={showBillDetail.rawData[0] || []}
            />
          </div>
        </div>
      </div>
    )}

    </>
  );
}
