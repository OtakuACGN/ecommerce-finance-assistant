import { describe, expect, it } from "vitest";
import { replaceImportedBillSource } from "./importMerge";
import type { PddBillLine } from "./types";

function line(
  time: string,
  sourceName: string,
  sourceFingerprint: string,
): PddBillLine & { sourceFingerprint: string } {
  return {
    orderId: time,
    time,
    income: 100,
    expense: 0,
    billType: "交易收入",
    remark: "",
    bizDesc: "",
    shopName: "店A",
    sourceName,
    sourceFingerprint,
  };
}

describe("PDD bill import source identity", () => {
  it("keeps same-named ledger files from different months", () => {
    const existing = [line("2026-06-01", "账务明细.csv", "a".repeat(64))];
    const incoming = [line("2026-07-01", "", "")];

    const merged = replaceImportedBillSource(
      existing,
      incoming,
      "店A",
      "账务明细.csv",
      "b".repeat(64),
    );

    expect(merged.map((item) => item.time)).toEqual([
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("replaces renamed ledger content by fingerprint", () => {
    const fingerprint = "c".repeat(64);
    const existing = [line("2026-06-01", "账务明细.csv", fingerprint)];
    const incoming = [line("2026-06-01", "", "")];

    const merged = replaceImportedBillSource(
      existing,
      incoming,
      "六月最终版",
      "六月最终版.csv",
      fingerprint,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceName).toBe("六月最终版.csv");
  });
});
