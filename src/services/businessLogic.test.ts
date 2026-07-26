import { describe, expect, it } from "vitest";
import { parseBill } from "./businessLogic";

describe("generic bill parsing", () => {
  it("keeps signed platform fees and subsidies when calculating net amount", () => {
    const record = parseBill({
      name: "淘宝账单.csv",
      path: "",
      headers: ["交易收入", "平台服务费", "补贴", "日期"],
      data: [
        ["交易收入", "平台服务费", "补贴", "日期"],
        [100, -5, -3, "2026-06-01"],
      ],
    });

    expect(record.totalAmount).toBe(100);
    expect(record.commission).toBe(-5);
    expect(record.subsidy).toBe(-3);
    expect(record.netAmount).toBe(102);
  });

  it("sums decimal money in cents without floating-point drift", () => {
    const data = [
      ["交易收入", "日期"],
      ...Array.from({ length: 10 }, () => [0.1, "2026-06-01"]),
    ];

    const record = parseBill({
      name: "京东账单.csv",
      path: "",
      headers: data[0] as string[],
      data,
    });

    expect(record.totalAmount).toBe(1);
    expect(record.netAmount).toBe(1);
  });
});
