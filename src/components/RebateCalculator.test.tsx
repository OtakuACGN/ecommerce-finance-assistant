// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RebateCalculator from "./RebateCalculator";

afterEach(cleanup);

describe("品牌阶梯返利测算", () => {
  it("按默认阶梯累进计算，并随 GMV 更新", () => {
    render(<RebateCalculator defaultGmv={800000} desktopReady={false} />);

    expect(screen.getByTestId("rebate-total").textContent).toContain("19,000.00");

    fireEvent.change(screen.getByLabelText("返利测算月度GMV"), {
      target: { value: "1000000" },
    });
    expect(screen.getByTestId("rebate-total").textContent).toContain("25,000.00");
    expect(
      screen.getByRole("button", { name: "导出返利明细" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
