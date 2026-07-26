# 店财通（DianCaiTong）

面向国内电商（尤其拼多多）卖家的桌面财务工具：四表经营分析、毛利、快递对账、售后分析、广告直通车、扣点税、异常找坑。

**仓库：** https://github.com/OtakuACGN/ecommerce-finance-assistant

**当前版本：** 1.3.0

## 便携版（推荐）

1. 本机构建产物：`release/DianCaiTong-Portable-1.3.0.zip` / `release/win-unpacked/`
2. 解压后双击 **店财通.exe**（无需安装）
3. 安装包：`release/DianCaiTong-Setup-1.3.0.exe`

也可源码目录双击 `start-app.bat`（需已执行过 `npm run build:dir`）。

## 主要能力

### 拼多多经营分析
- **四表**：订单导出 / 账务明细 / 商品资料 / 推广分天（同店铺多文件可并存，同一来源重导自动替换）
- **拖入多文件自动识别**类型并分流
- **毛利**：确认收入 − 成本 − 包材 − 净运费 − 平台费 − 退货损耗 − 二次包装 − 品牌扣点 − 电商税 − 广告
- **退款口径**：部分仅退款只扣退款额、商品成本全额且不进货损；全额退收入≈0；发货后全额退默认货损比例 0（可参数自定义）
- **确认收入防错**：自动检查账务订单/金额覆盖率；账务不完整时回退订单口径并显式告警，也可强制指定口径
- **品牌扣点 / 电商税**均为可选参数，默认 0；品牌扣点与平台扣点分离
- **平台补贴分流**：真实活动补贴计入补贴；服务费/佣金退款返还冲减平台服务费，净平台费允许为负
- **扣点/税**：全局百分比 + **按店铺覆盖**
- **直通车**：按商品 ID 精确匹配，无 ID 不品名兜底；链接内 SKU 按成交拆分花费
- **商品资料闭环**：导出待填成本置顶 / 独立 sheet；回导提示待补并支持跳转
- **经营参数 JSON** 导入/导出
- **工作区备份/恢复**：保存订单、账务、商品、推广、SKU 映射和经营参数；恢复时按当前版本重新计算，避免沿用旧口径报表
- **大数据计算**：经营报表在后台 Worker 中生成，避免阻塞界面；金额汇总统一到分

### 快递对账
- 快递账单 vs 发货订单，主键运单号；多承运商（名称优先，YT/SF/JT/JD 等前缀辅助）
- **费用口径**：预付面单单独列；实际费用 = 运费 + 加收；预付差额 = 预付 − 运费
- 异常清单：真对不上 / 其他快递 / 多件 / 高运费；可视化 + 导出

### 售后分析
- 原因大项 + 描述小项多信号聚类
- 部分退识别、排行占比；空描述提示「大项无补充」
- 跨月退款订单独立统计：成交月 ≠ 退款成功/完成月（缺失时依次回退同意/确认时间、申请时间）；按订单去重展示数量、占比，并可筛选/导出明细

### 其它
- SKU 映射、收款/账单对账（对接经营分析主数据）、利润测算表、月度汇总
- 跨月账务文件按流水发生月拆分，避免整份文件误归属首月

## 从源码运行

```bash
git clone https://github.com/OtakuACGN/ecommerce-finance-assistant.git
cd ecommerce-finance-assistant
npm install
npm run dev
```

### 冒烟测试

```bash
npm run smoke
```

### 完整校验

```bash
npm run validate
```

### 压力与工作簿校验

```bash
npm run stress
npm run validate:workbook -- "output/拼多多经营分析_2026-07-20.xlsx"
```

### 打包

```bash
# 免安装目录（win-unpacked）
npm run build:dir

# NSIS 安装包（可能较慢）
npm run build
```

便携 zip 示例：

```powershell
Compress-Archive -Path release\win-unpacked\* -DestinationPath release\DianCaiTong-Portable-1.3.0.zip -Force
```

## 技术栈

Electron 43 + React 18 + TypeScript + Vite 8 + Tailwind + SheetJS xlsx 0.20

## 许可证

MIT
