/// <reference lib="webworker" />
import { buildOperatingReport } from "../services/pddBusiness";
import type { OperatingReportInput } from "../services/operatingReportRunner";

self.onmessage = (event: MessageEvent<OperatingReportInput>) => {
  try {
    const input = event.data;
    const report = buildOperatingReport(
      input.orders,
      input.billLines,
      input.products,
      input.ads,
      input.settings,
      input.adProducts,
    );
    self.postMessage({ ok: true, report });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "经营报表后台计算失败",
    });
  }
};

export {};
