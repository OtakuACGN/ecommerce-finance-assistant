import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAccrualTable } from "./billAccrual";
import { businessMonthOf, businessMonthsOf } from "./businessPeriod";

describe("business period parsing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recognizes a date range as its accounting month for cross-period checks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));

    const table = buildAccrualTable([{
      fileName: "六月账单.csv",
      platform: "其他",
      date: "2026-06-01 ~ 2026-06-30",
      totalAmount: 100,
      orderCount: 1,
      commission: 0,
      techFee: 0,
      subsidy: 0,
      netAmount: 100,
      rawData: [],
    }]);

    expect(table[1][table[0].indexOf("是否跨期")]).toBe("⚠️跨期");
  });

  it("extracts both endpoints from a cross-month date range", () => {
    expect(businessMonthsOf("2026-06-28 ~ 2026-07-03")).toEqual([
      "2026-06",
      "2026-07",
    ]);
    expect(businessMonthOf(46_204)).toBe("2026-07");
    expect(businessMonthOf("123456789012345678")).toBe("");
  });

  it("marks an unrecognized period explicitly instead of treating it as current", () => {
    const table = buildAccrualTable([{
      fileName: "未知账期.csv",
      platform: "其他",
      date: "未知账期",
      totalAmount: 100,
      orderCount: 1,
      commission: 0,
      techFee: 0,
      subsidy: 0,
      netAmount: 100,
      rawData: [],
    }]);

    expect(table[1][table[0].indexOf("是否跨期")]).toBe("⚠️账期未知");
  });
});
