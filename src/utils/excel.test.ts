import { describe, expect, it } from "vitest";
import { parseTabularBuffer } from "./excel";
import { parsePddOrders } from "../services/pdd";

describe("tabular import", () => {
  it("preserves long and zero-prefixed order ids from CSV through order parsing", async () => {
    const csv = [
      "订单号,订单状态,商品名称,商品数量,商品总价,订单成交时间",
      "123456789012345678,已收货,商品A,1,100,2026-06-01 10:00:00",
      "001234567890123456,已收货,商品B,1,20,2026-06-02 10:00:00",
    ].join("\r\n");
    const bytes = new TextEncoder().encode(csv);

    const fileData = await parseTabularBuffer("拼多多订单.csv", bytes.buffer);
    const orders = parsePddOrders(fileData);

    expect(orders.map((order) => order.orderId)).toEqual([
      "123456789012345678",
      "001234567890123456",
    ]);
  });

  it("assigns the same content fingerprint after a source file is renamed", async () => {
    const bytes = new TextEncoder().encode("日期,交易收入\r\n2026-06-01,100");

    const original = await parseTabularBuffer("账务明细.csv", bytes.buffer);
    const renamed = await parseTabularBuffer("六月最终版.csv", bytes.buffer);

    expect(original.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(renamed.sourceFingerprint).toBe(original.sourceFingerprint);
  });

  it("rejects an already-unsafe numeric order id instead of matching a rounded id", () => {
    expect(() => parsePddOrders({
      name: "拼多多订单.xlsx",
      path: "",
      headers: ["订单号", "订单状态"],
      data: [
        ["订单号", "订单状态"],
        [123456789012345680, "已收货"],
      ],
    })).toThrow(/订单号.*文本格式/);
  });
});
