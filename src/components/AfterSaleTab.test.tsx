// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AfterSaleTab from "./AfterSaleTab";

const adapters = vi.hoisted(() => ({
  openDataFiles: vi.fn(),
  processFile: vi.fn(),
}));

vi.mock("../utils/desktop", () => ({
  openDataFiles: adapters.openDataFiles,
  saveDataFile: vi.fn(),
}));

vi.mock("../utils/excel", () => ({
  processFile: adapters.processFile,
  exportWorkbook: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("售后跨月退款统计", () => {
  it("独立显示跨月退款订单数、占比，并可筛选明细", async () => {
    const afterFile = {
      name: "售后.xlsx",
      path: "售后.xlsx",
      headers: [
        "售后单号",
        "平台售后状态",
        "平台订单号",
        "申请退款金额",
        "申请时间",
        "确认时间",
      ],
      data: [
        [
          "售后单号",
          "平台售后状态",
          "平台订单号",
          "申请退款金额",
          "申请时间",
          "确认时间",
        ],
        ["SH-CROSS", "退款成功", "ORD-CROSS", 20, "2026-07-01", "2026-07-02"],
        ["SH-SAME", "退款成功", "ORD-SAME", 10, "2026-07-08", "2026-07-09"],
      ],
    };
    const orderFile = {
      name: "订单.xlsx",
      path: "订单.xlsx",
      headers: ["订单号", "商品总价", "成交时间"],
      data: [
        ["订单号", "商品总价", "成交时间"],
        ["ORD-CROSS", 50, "2026-06-30 23:50:00"],
        ["ORD-SAME", 30, "2026-07-02 10:00:00"],
      ],
    };
    adapters.openDataFiles
      .mockResolvedValueOnce({ canceled: false, filePaths: ["售后.xlsx"] })
      .mockResolvedValueOnce({ canceled: false, filePaths: ["订单.xlsx"] });
    adapters.processFile
      .mockResolvedValueOnce(afterFile)
      .mockResolvedValueOnce(orderFile);

    render(
      <AfterSaleTab
        desktopReady
        onError={vi.fn()}
        showToast={vi.fn()}
      />,
    );

    const pickButtons = screen.getAllByRole("button", { name: "选择文件" });
    fireEvent.click(pickButtons[0]);
    expect(await screen.findByText("售后.xlsx")).not.toBeNull();
    fireEvent.click(pickButtons[1]);
    expect(await screen.findByText("订单.xlsx")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "开始售后分析 →" }));

    expect(
      await screen.findByRole("button", { name: /跨月退款\s*1\s*50\.0%/ }),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /跨月退款\s*1\s*50\.0%/ }),
    );
    expect(screen.getByText("1 行")).not.toBeNull();
  });
});
