import {
  buildOperatingReport,
  type AdDay,
  type AdProduct,
  type CostSettings,
  type OperatingReport,
  type PddBillLine,
  type PddOrder,
  type ProductSku,
} from "./pddBusiness";

export interface OperatingReportInput {
  orders: PddOrder[];
  billLines: PddBillLine[];
  products: ProductSku[];
  ads: AdDay[];
  settings: CostSettings;
  adProducts: AdProduct[];
}

/**
 * 在浏览器/Electron 中把大报表计算移出渲染线程。
 * Node/jsdom 环境没有 Worker 时保留同步实现，便于脚本与单元测试复用同一逻辑。
 */
export function buildOperatingReportAsync(
  input: OperatingReportInput,
): Promise<OperatingReport> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(
      buildOperatingReport(
        input.orders,
        input.billLines,
        input.products,
        input.ads,
        input.settings,
        input.adProducts,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/operatingReport.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => worker.terminate();
    worker.onmessage = (
      event: MessageEvent<
        | { ok: true; report: OperatingReport }
        | { ok: false; error: string }
      >,
    ) => {
      cleanup();
      if (event.data.ok) resolve(event.data.report);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "经营报表后台计算失败"));
    };
    worker.postMessage(input);
  });
}
