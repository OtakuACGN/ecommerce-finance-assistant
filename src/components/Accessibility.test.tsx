// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";
import Toast from "./Toast";

afterEach(cleanup);

describe("全局反馈组件", () => {
  it("确认弹窗具备对话框语义，并支持 Escape 取消", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="恢复工作区"
        message="将替换当前数据"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "恢复工作区" }).getAttribute("aria-modal"),
    ).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("错误通知使用 alert 语义且关闭按钮有名称", () => {
    render(
      <Toast
        toasts={[{ id: "1", type: "error", message: "导入失败" }]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("导入失败");
    expect(screen.getByRole("button", { name: "关闭通知" })).not.toBeNull();
  });
});
