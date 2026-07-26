import { describe, expect, it } from "vitest";
import { normalizeIdentifier } from "./identifier";
import { reconcileOrderPayments } from "../services/pdd/parse";

describe("identifier normalization", () => {
  it("preserves text ids and rejects values whose exact digits are unavailable", () => {
    expect(normalizeIdentifier("001234567890123456", "订单号")).toBe(
      "001234567890123456",
    );
    expect(() => normalizeIdentifier(123456789012345680, "订单号")).toThrow(
      /订单号.*文本格式/,
    );
    expect(() => normalizeIdentifier("1.2345678901234568E+17", "订单号")).toThrow(
      /订单号.*科学计数法/,
    );
  });

  it("blocks unsafe ids on both sides of payment reconciliation", () => {
    expect(() =>
      reconcileOrderPayments(
        [["订单号", "订单金额"], [123456789012345680, 100]],
        [["订单号", "收款金额"], [123456789012345680, 100]],
      ),
    ).toThrow(/订单号.*文本格式/);
  });
});
