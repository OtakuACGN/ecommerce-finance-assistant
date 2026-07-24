# 店财通（DianCaiTong）

面向国内电商（尤其拼多多）卖家的桌面财务工具：四表经营分析、毛利、快递对账、售后分析、广告直通车、扣点税、异常找坑。

**仓库：** https://github.com/OtakuACGN/ecommerce-finance-assistant

**当前版本：** 1.2.4

## 便携版（推荐）

1. 本机构建产物：`release/DianCaiTong-Portable-1.2.4.zip` / `release/win-unpacked/`
2. 解压后双击 **店财通.exe**（无需安装）
3. 安装包：`release/DianCaiTong-Setup-1.2.4.exe`

也可源码目录双击 `start-app.bat`（需已执行过 `npm run build:dir`）。

## 主要能力

### 拼多多经营分析
- **四表**：订单导出 / 账务明细 / 商品资料 / 推广分天
- **拖入多文件自动识别**类型并分流
- **毛利**：确认收入 − 成本 − 包材 − 净运费 − 平台费 − 退货损耗 − 二次包装 − 品牌扣点 − 电商税 − 广告
- **品牌扣点**可空可填，与平台扣点分离
- **扣点/税**：全局百分比 + **按店铺覆盖**
- **直通车**：按商品 ID 精确匹配，无 ID 不品名兜底；链接内 SKU 按成交拆分花费
- **商品资料闭环**：导出待填成本置顶 / 独立 sheet；回导提示待补并支持跳转
- **经营参数 JSON** 导入/导出

### 快递对账
- 快递账单 vs 发货订单，主键运单号；多承运商（名称优先，YT/SF/JT/JD 等前缀辅助）
- **费用口径**：预付面单单独列；实际费用 = 运费 + 加收；预付差额 = 预付 − 运费
- 异常清单：真对不上 / 其他快递 / 多件 / 高运费；可视化 + 导出

### 售后分析
- 原因大项 + 描述小项多信号聚类
- 部分退识别、排行占比；空描述提示「大项无补充」

### 其它
- SKU 映射、收款/账单对账（对接经营分析主数据）、利润测算表、月度汇总

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

### 打包

```bash
# 免安装目录（win-unpacked）
npm run build:dir

# NSIS 安装包（可能较慢）
npm run build
```

便携 zip 示例：

```powershell
Compress-Archive -Path release\win-unpacked\* -DestinationPath release\DianCaiTong-Portable-1.2.4.zip -Force
```

## 技术栈

Electron 28 + React 18 + TypeScript + Vite 5 + Tailwind + xlsx

## 许可证

MIT
