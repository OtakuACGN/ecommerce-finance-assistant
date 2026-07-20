# 店财通（DianCaiTong）

面向国内电商（尤其拼多多）卖家的桌面财务工具：四表经营分析、毛利、退货逆向、广告、扣点税、异常找坑。

**仓库：** https://github.com/OtakuACGN/ecommerce-finance-assistant

## 便携版（推荐）

1. 打开 [Releases](https://github.com/OtakuACGN/ecommerce-finance-assistant/releases) 下载 `DianCaiTong-Portable-1.1.0.zip`
2. 解压后双击 **店财通.exe**（无需安装）
3. 本机已构建路径：`release/DianCaiTong-Portable-1.1.0.zip` / `release/win-unpacked/`

也可源码目录双击 `start-app.bat`（需已执行过 `npm run build:dir`）。

## 主要能力

### 拼多多经营分析
- **四表**：订单导出 / 账务明细 / 商品资料 / 推广分天
- **拖入多文件自动识别**类型并分流
- **毛利**：确认收入 − 成本 − 包材 − 净运费 − 平台费 − 退货损耗 − 二次包装 − 品牌扣点 − 电商税 − 广告
- **退货退款率（主）**：发货后全部退 / 已发货
- **扣点/税**：全局百分比 + **按店铺覆盖**
- **一键参数模板**（无扣点 / 5%+1% / 高退货损耗等）
- **毛利被谁吃掉了**对照卡（退货 / 扣点税 / 广告）
- **异常找坑**导出：负毛利、未匹配成本、扣点税变亏、高逆向规格
- **经营参数 JSON** 导入/导出（换电脑可带走）
- **老板一页纸**、时段对比、SPU/规格排行、待补 SKU

### 其它
- 数据清洗合并、SKU 映射、收款/账单对账、品牌返利、月度汇总

## 从源码运行

```bash
git clone https://github.com/OtakuACGN/ecommerce-finance-assistant.git
cd ecommerce-finance-assistant
npm install
npm run dev
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
Compress-Archive -Path release\win-unpacked\* -DestinationPath release\DianCaiTong-Portable-1.1.0.zip -Force
```

## 技术栈

Electron 28 + React 18 + TypeScript + Vite 5 + Tailwind + xlsx

## 许可证

MIT
