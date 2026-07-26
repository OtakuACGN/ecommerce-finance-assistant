// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(cleanup);

const tabs = [
  ["经营分析", "拼多多经营分析"],
  ["直通车细分", "直通车细分"],
  ["利润测算", "利润测算"],
  ["销售排行", "按编码销售排行总榜"],
  ["月度汇总", "月度对账汇总"],
  ["SKU映射", "SKU 映射表"],
  ["收款对账", "收款对账"],
  ["账单对账", "平台账单"],
  ["快递对账", "快递对账"],
  ["售后分析", "售后分析"],
] as const;

describe("店财通主导航", () => {
  it("逐项打开 10 个功能页签且页面内容可见", () => {
    render(<App />);

    for (const [tabLabel, pageHeading] of tabs) {
      const tab = screen.getByRole("button", { name: tabLabel });
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-current")).toBe("page");
      expect(
        screen.getByRole("heading", { name: new RegExp(pageHeading) }),
      ).not.toBeNull();
    }
  });

  it("提供主导航、主要内容和浏览器模式说明", () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "主功能" })).not.toBeNull();
    expect(screen.getByRole("main").getAttribute("id")).toBe("main-content");
    expect(screen.getByText(/浏览器预览模式/)).not.toBeNull();
  });

  it("月度汇总不再展示已废弃的品牌阶梯返利", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "月度汇总" }));

    expect(screen.queryByText(/品牌阶梯返利|品牌返点/)).toBeNull();
  });
});
