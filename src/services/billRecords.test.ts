import { describe, expect, it } from "vitest";
import type { BillRecord } from "./businessLogic";
import { replaceBillRecordSources } from "./billRecords";

function record(
  sourceName: string,
  date: string,
  sourceFingerprint: string,
  totalAmount = 100,
): BillRecord & { sourceFingerprint: string } {
  return {
    fileName: sourceName,
    sourceName,
    sourceFingerprint,
    platform: "淘宝",
    shopName: "店A",
    date,
    totalAmount,
    orderCount: 1,
    commission: 0,
    techFee: 0,
    subsidy: 0,
    netAmount: totalAmount,
    rawData: [],
  };
}

describe("bill import source identity", () => {
  it("keeps same-named files from different accounting months", () => {
    const existing = [record("账务明细.csv", "2026-06-01", "a".repeat(64))];
    const incoming = [record("账务明细.csv", "2026-07-01", "b".repeat(64))];

    const merged = replaceBillRecordSources(existing, incoming);

    expect(merged.map((item) => item.date)).toEqual([
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("replaces identical content even when the file was renamed", () => {
    const fingerprint = "c".repeat(64);
    const existing = [record("账务明细.csv", "2026-06-01", fingerprint, 100)];
    const changedInference = record("六月最终版.csv", "2026-06-01", fingerprint, 110);
    changedInference.platform = "其他";
    changedInference.shopName = "六月最终版";
    const incoming = [changedInference];

    const merged = replaceBillRecordSources(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].fileName).toBe("六月最终版.csv");
    expect(merged[0].totalAmount).toBe(110);
  });
});
