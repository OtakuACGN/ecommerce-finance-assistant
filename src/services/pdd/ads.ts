/**
 * 推广解析
 */
import type { FileData } from "../../utils/excel";
import { findCol } from "../businessLogic";
import type { AdDay, AdProduct } from "./types";
import { normalizeFileData } from "./parse";
import {
  toNum,
  cell,
  cellId,
  findColExactThen,
  isAdDailyDate,
} from "./helpers";

export function parseAdDaily(fileData: FileData): AdDay[] {
  const data = normalizeFileData(fileData);
  const h = data.headers;
  const dateCol = findCol(h, ["日期", "date"]);
  // 优先总花费；不要把汇总行的「总计」列混进来——按日行相加即可
  const spendCol = findCol(h, ["总花费", "成交花费", "花费", "消耗"]);
  const gmvCol = findCol(h, ["交易额", "gmv"]);
  const netGmvCol = findCol(h, ["净交易额"]);
  const settledCol = findCol(h, ["结算交易额"]);
  const ordersCol = findCol(h, ["成交笔数", "净成交笔数"]);
  const roiCol = findCol(h, ["实际投产比", "投产比", "roi"]);
  const netRoiCol = findCol(h, ["净实际投产比", "净投产比"]);
  const settledRoiCol = findCol(h, ["结算投产比"]);
  const impCol = findCol(h, ["曝光量"]);
  const clickCol = findCol(h, ["点击量"]);

  const recomputeRoi = (d: AdDay) => {
    if (d.spend > 0) {
      if (d.gmv > 0) d.roi = d.gmv / d.spend;
      if (d.netGmv > 0) d.netRoi = d.netGmv / d.spend;
      if (d.settledGmv > 0) d.settledRoi = d.settledGmv / d.spend;
    }
    return d;
  };

  const byDate = new Map<string, AdDay>();
  for (const row of data.data.slice(1)) {
    const date = cell(row, dateCol);
    if (!isAdDailyDate(date)) continue;
    const spend = toNum(cell(row, spendCol >= 0 ? spendCol : findCol(h, ["成交花费"])));
    const gmv = toNum(cell(row, gmvCol));
    const netGmv = toNum(cell(row, netGmvCol));
    const settledGmv = toNum(cell(row, settledCol));
    const day: AdDay = {
      date,
      spend,
      gmv,
      netGmv,
      settledGmv,
      orders: toNum(cell(row, ordersCol)),
      roi: toNum(cell(row, roiCol)),
      netRoi: toNum(cell(row, netRoiCol)),
      settledRoi: toNum(cell(row, settledRoiCol)),
      impressions: toNum(cell(row, impCol)),
      clicks: toNum(cell(row, clickCol)),
    };
    recomputeRoi(day);
    const prev = byDate.get(date);
    if (!prev) {
      byDate.set(date, day);
    } else {
      prev.spend += day.spend;
      prev.gmv += day.gmv;
      prev.netGmv += day.netGmv;
      prev.settledGmv += day.settledGmv;
      prev.orders += day.orders;
      prev.impressions += day.impressions;
      prev.clicks += day.clicks;
      recomputeRoi(prev);
      byDate.set(date, prev);
    }
  }
  return Array.from(byDate.values())
    .map(recomputeRoi)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** 商品推广汇总：按商品ID合并花费（同一商品多计划相加） */
export function parseAdProduct(fileData: FileData): AdProduct[] {
  const data = normalizeFileData(fileData);
  const h = data.headers;
  const idCol = findColExactThen(h, ["商品id", "商品ID", "商品Id", "商品编号"]);
  const nameCol = findCol(h, ["商品名称", "商品"]);
  const campCol = findCol(h, ["推广名称", "计划名称", "单元名称"]);
  const spendCol = findCol(h, ["总花费", "成交花费", "花费", "消耗"]);
  const dealSpendCol = findCol(h, ["成交花费"]);
  const gmvCol = findCol(h, ["交易额", "gmv"]);
  const netGmvCol = findCol(h, ["净交易额"]);
  const settledCol = findCol(h, ["结算交易额"]);
  const ordersCol = findCol(h, ["成交笔数", "净成交笔数"]);
  const roiCol = findCol(h, ["实际投产比", "投产比", "roi"]);
  const netRoiCol = findCol(h, ["净实际投产比", "净投产比"]);
  const settledRoiCol = findCol(h, ["结算投产比"]);

  const byId = new Map<string, AdProduct>();
  for (const row of data.data.slice(1)) {
    const productId = cellId(row, idCol);
    const productName = cell(row, nameCol);
    if (!productId && !productName) continue;
    // 跳过汇总行（否则「总计」会把花费再计一遍）
    if (/^(总计|合计|汇总|小计|-|—|－|)$/.test(productId)) continue;
    if (/总计|合计|汇总|小计/.test(productName)) continue;
    // 商品ID 应为较长数字；非数字 ID 且无有效品名则跳过
    if (productId && !/^\d{6,}$/.test(productId)) continue;
    const spend = toNum(cell(row, spendCol >= 0 ? spendCol : dealSpendCol));
    const dealSpend = toNum(cell(row, dealSpendCol >= 0 ? dealSpendCol : spendCol));
    if (spend <= 0 && dealSpend <= 0) continue;
    const key = productId || ("name:" + productName);
    const prev = byId.get(key);
    const gmv = toNum(cell(row, gmvCol));
    const netGmv = toNum(cell(row, netGmvCol));
    const settledGmv = toNum(cell(row, settledCol));
    const orders = toNum(cell(row, ordersCol));
    if (!prev) {
      byId.set(key, {
        productId,
        productName,
        campaignName: cell(row, campCol),
        spend: spend || dealSpend,
        dealSpend: dealSpend || spend,
        gmv,
        netGmv,
        settledGmv,
        orders,
        roi: toNum(cell(row, roiCol)),
        netRoi: toNum(cell(row, netRoiCol)),
        settledRoi: toNum(cell(row, settledRoiCol)),
      });
    } else {
      prev.spend += spend || dealSpend;
      prev.dealSpend += dealSpend || spend;
      prev.gmv += gmv;
      prev.netGmv += netGmv;
      prev.settledGmv += settledGmv;
      prev.orders += orders;
      if (!prev.productName && productName) prev.productName = productName;
      if (prev.spend > 0) {
        prev.roi = prev.gmv / prev.spend;
        prev.netRoi = prev.netGmv / prev.spend;
        prev.settledRoi = prev.settledGmv / prev.spend;
      }
      byId.set(key, prev);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.spend - a.spend);
}
