// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillTab from "./BillTab";
import type { BillRecord } from "../services/businessLogic";

afterEach(cleanup);

describe("平台账单净费用展示", () => {
  it("服务费返还大于扣费时显示为正向返还，不出现双负号", () => {
    const record: BillRecord = {
      fileName: "账务明细.xlsx",
      platform: "拼多多",
      date: "2026-07",
      totalAmount: 0,
      orderCount: 1,
      commission: 0,
      techFee: -5,
      subsidy: 0,
      refundAmount: 0,
      otherFee: 0,
      netAmount: 5,
      rawData: [],
    };

    render(
      <BillTab
        billRecords={[record]}
        refundRecords={[]}
        refundLossData={[]}
        commissionDetails={[]}
        accrualData={[]}
        desktopReady
        showBillDetail={record}
        setShowBillDetail={vi.fn()}
        onImportBill={vi.fn()}
        onImportCommission={vi.fn()}
        onGenerateAccrual={vi.fn()}
        onImportRefund={vi.fn()}
        onGenerateRefundLoss={vi.fn()}
        onExportRefundLoss={vi.fn()}
        onRemoveBill={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(screen.getAllByText("+¥5")).not.toHaveLength(0);
    expect(screen.getByText("+¥5.00")).not.toBeNull();
    expect(screen.queryByText(/-¥-5/)).toBeNull();
  });
});
