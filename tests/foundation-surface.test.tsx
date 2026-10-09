import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../src/components/shell/ContextMenu";
import { PrismTitleBar } from "../src/components/shell/PrismTitleBar";

describe("Foundation surface", () => {
  it("browser preview renders disabled window controls", () => {
    render(<PrismTitleBar title="basic.pdf" />);
    expect(screen.getByLabelText("Close window")).toBeDisabled();
    expect(screen.getByText("basic.pdf")).toBeInTheDocument();
  });
  it("suppresses the browser menu, merges viewer actions and supports keyboard dismissal", () => {
    const action = vi.fn();
    render(
      <>
        <div className="viewer-host" data-testid="viewer">
          Page
        </div>
        <ContextMenu />
      </>,
    );
    const viewer = screen.getByTestId("viewer");
    viewer.addEventListener("prism-context-actions", (event) => {
      (event as CustomEvent).detail.push({
        id: "fit",
        label: "Fit width",
        action,
      });
    });
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 5000,
      clientY: 5000,
    });
    fireEvent(viewer, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Fit width" })).toHaveFocus();
    const menu = screen.getByRole("menu");
    expect(parseInt(menu.style.left)).toBeLessThan(window.innerWidth);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("captures selected text before menu focus and copies that selection", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    render(
      <>
        <input defaultValue="Prism selection" aria-label="Text" />
        <ContextMenu />
      </>,
    );
    const input = screen.getByLabelText("Text") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(6, 15);
    fireEvent.contextMenu(input);
    fireEvent.click(screen.getByRole("menuitem", { name: /Copy/ }));
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith("selection");
  });
  it("closes on outside interaction and window blur", () => {
    render(
      <>
        <p>Blank</p>
        <ContextMenu />
      </>,
    );
    fireEvent.contextMenu(screen.getByText("Blank"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText("Blank"));
    fireEvent(window, new Event("blur"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
