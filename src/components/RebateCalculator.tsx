import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_REBATE_TIERS,
  calculateRebate,
  generateRebateTable,
  type RebateTier,
} from "../services/businessLogic";
import { saveDataFile } from "../utils/desktop";
import { exportToExcel } from "../utils/excel";

interface Props {
  defaultGmv?: number;
  desktopReady: boolean;
}

const copyDefaultTiers = () => DEFAULT_REBATE_TIERS.map((tier) => ({ ...tier }));

export default function RebateCalculator({
  defaultGmv = 0,
  desktopReady,
}: Props) {
  const [gmvYuan, setGmvYuan] = useState(Math.max(0, defaultGmv));
  const [tiers, setTiers] = useState<RebateTier[]>(copyDefaultTiers);

  useEffect(() => {
    setGmvYuan(Math.max(0, defaultGmv));
  }, [defaultGmv]);

  const calculation = useMemo(
    () => calculateRebate(gmvYuan / 10000, tiers),
    [gmvYuan, tiers],
  );
  const rebateYuan = calculation.totalRebate * 10000;

  const updateRate = (index: number, value: number) => {
    setTiers((current) =>
      current.map((tier, tierIndex) =>
        tierIndex === index
          ? { ...tier, rate: Number.isFinite(value) ? Math.max(0, value) : 0 }
          : tier,
      ),
    );
  };

  const handleExport = async () => {
    if (gmvYuan <= 0) return;
    const result = await saveDataFile("品牌阶梯返利测算.xlsx");
    if (!result.canceled && result.filePath) {
      await exportToExcel(generateRebateTable(gmvYuan, tiers), result.filePath);
    }
  };

  return (
    <section className="panel-card overflow-hidden" aria-labelledby="rebate-title">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="rebate-title" className="font-semibold text-gray-800">
            品牌阶梯返利测算
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            按累进阶梯计算；比例仅为默认模板，请以实际品牌合同为准
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">预计返利</div>
          <div
            className="text-xl font-bold text-emerald-700"
            data-testid="rebate-total"
          >
            ¥
            {rebateYuan.toLocaleString("zh-CN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            月度 GMV（元）
            <input
              aria-label="返利测算月度GMV"
              type="number"
              min="0"
              step="0.01"
              value={gmvYuan}
              onChange={(event) =>
                setGmvYuan(Math.max(0, Number(event.target.value) || 0))
              }
              className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-2 tabular-nums focus-visible:border-blue-500"
            />
          </label>
          <button
            type="button"
            onClick={() => setTiers(copyDefaultTiers())}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            恢复默认阶梯
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!desktopReady || gmvYuan <= 0}
            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-40"
          >
            导出返利明细
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {tiers.map((tier, index) => (
            <label
              key={`${tier.min}-${tier.max}`}
              className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs text-gray-600"
            >
              {tier.label}（%）
              <input
                aria-label={`${tier.label}返利比例`}
                type="number"
                min="0"
                step="0.1"
                value={tier.rate}
                onChange={(event) =>
                  updateRate(index, Number(event.target.value))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
          ))}
        </div>

        {calculation.details.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">阶梯</th>
                  <th className="px-3 py-2 text-right">适用 GMV（万）</th>
                  <th className="px-3 py-2 text-right">比例</th>
                  <th className="px-3 py-2 text-right">返利（元）</th>
                </tr>
              </thead>
              <tbody>
                {calculation.details.map((detail, index) => (
                  <tr key={`${detail[0]}-${index}`} className="border-t">
                    <td className="px-3 py-2">{detail[0]}</td>
                    <td className="px-3 py-2 text-right">{detail[3]}</td>
                    <td className="px-3 py-2 text-right">{detail[2]}</td>
                    <td className="px-3 py-2 text-right">
                      {(
                        Number.parseFloat(String(detail[4])) * 10000
                      ).toLocaleString("zh-CN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
