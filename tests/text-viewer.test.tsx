import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createBuiltinRegistry } from "../src/viewer/builtins";
import { TextViewer } from "../src/viewer/plugins/text/TextViewer";
import { TextInspector } from "../src/viewer/plugins/text/TextInspector";
import {
  loadText,
  type TextDocumentModel,
} from "../src/viewer/plugins/text/text-model";
import { descriptor, source } from "./viewer-helpers";
import type { ViewerSessionState } from "../src/viewer/core/types";
async function model(text: string, name = "basic.txt") {
  const bytes = new TextEncoder().encode(text),
    file = { ...descriptor(name), size: bytes.length };
  return loadText({
    file,
    source: source(text),
    signal: new AbortController().signal,
    services: { file: {} },
    onCleanup() {},
  });
}
function Surface({
  model,
  inspect = false,
}: {
  model: TextDocumentModel;
  inspect?: boolean;
}) {
  const [session, setSession] = useState<ViewerSessionState>({ metadata: {} });
  return (
    <>
      <TextViewer
        model={model}
        context={model.context}
        session={session}
        updateSession={(patch) =>
          setSession((previous) => ({ ...previous, ...patch }))
        }
      />
      {inspect && (
        <TextInspector
          model={model}
          selected={session.metadata.textSelected as any}
        />
      )}
    </>
  );
}
describe("Text plugin integration", () => {
  it.each([
    ["basic.txt", "core.text-fallback"],
    ["example.ts", "core.text-fallback"],
    ["basic.log", "core.text-fallback"],
    [".env", "core.text-fallback"],
    ["unknown.custom", "core.text-fallback"],
    ["basic.md", "markdown"],
    ["basic.json", "json"],
    ["basic.csv", "csv"],
  ])("routes %s without stealing structured viewers", async (name, id) => {
    expect((await createBuiltinRegistry().resolve(descriptor(name)))?.id).toBe(
      id,
    );
  });
  it("rejects binary even with a text descriptor flag", async () => {
    const registry = createBuiltinRegistry();
    expect(
      await registry.resolve(
        { ...descriptor(), isBinary: true },
        { forceId: "core.text-fallback" },
      ),
    ).toBeUndefined();
  });
  it("uses shared profile defaults and shows accurate selected-line inspection", async () => {
    const document = await model(
      "2026-10-08 00:00:00 ERROR failed\nnext",
      "server.log",
    );
    render(<Surface model={document} inspect />);
    expect(screen.getByLabelText("Wrap lines")).not.toBeChecked();
    expect(screen.getByLabelText("Line numbers")).toBeChecked();
    fireEvent.click(
      screen.getByLabelText("Read-only text").querySelector(".text-level")!,
    );
    expect(screen.getByLabelText("Text inspection")).toHaveTextContent(
      "LINE 1",
    );
    expect(screen.getByLabelText("Text inspection")).toHaveTextContent(
      "Timestamp",
    );
    fireEvent.click(screen.getByLabelText("Wrap lines"));
    expect(screen.getByLabelText("Read-only text")).toHaveClass("wrap-lines");
    document.dispose();
  });
  it("renders untrusted HTML, script, URLs and ANSI as inert selectable source", async () => {
    const text =
      "<script>alert(1)</script>\n<img src=x onerror=alert(1)>\njavascript:alert(1)\n\u001b[31mERROR\u001b[0m";
    const document = await model(text);
    const view = render(<Surface model={document} />);
    expect(view.container.querySelectorAll("script,img,a")).toHaveLength(0);
    expect(screen.getByLabelText("Read-only text")).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    document.dispose();
  });
  it("search keyboard navigation, cancel and regex unavailable fallback feedback", async () => {
    const document = await model("ERROR first\nERROR second\nlast");
    render(<Surface model={document} />);
    fireEvent.keyDown(window.document, { key: "f", ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Search text"), {
      target: { value: "ERROR" },
    });
    await waitFor(() =>
      expect(screen.getByRole("search")).toHaveTextContent("2 matches"),
    );
    await waitFor(() =>
      expect(
        window.document.querySelector("mark")?.parentElement?.textContent,
      ).toBe("ERROR first"),
    );
    fireEvent.keyDown(screen.getByLabelText("Search text"), { key: "Enter" });
    await waitFor(() =>
      expect(
        window.document.querySelector("mark")?.parentElement?.textContent,
      ).toBe("ERROR second"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Regex" }));
    await screen.findByText(/Background workers are required/);
    document.dispose();
  });
  it("virtualizes 100k lines and disposes index tasks", async () => {
    const document = await model("line\n".repeat(100000));
    await waitFor(() => expect(document.status).toBe("complete"), {
      timeout: 10000,
    });
    const view = render(<Surface model={document} />);
    expect(view.container.querySelectorAll(".text-row").length).toBeLessThan(
      100,
    );
    expect(document.checkpoints.length).toBeLessThan(400);
    document.dispose();
    await expect(
      document.lines(10, 1, new AbortController().signal),
    ).rejects.toHaveProperty("name", "AbortError");
  });
  it("long-line pages preserve multibyte characters across boundaries", async () => {
    const text = "x".repeat(16383) + "世界🌈" + "y".repeat(18000),
      document = await model(text);
    const line = {
      number: 1,
      offset: 0,
      end: new TextEncoder().encode(text).length,
      text: "",
      truncated: true,
    };
    const pages = [
      await document.linePage(line, 0),
      await document.linePage(line, 1),
      await document.linePage(line, 2),
    ];
    expect(pages.join("")).toBe(text);
    document.dispose();
  });
  it("background cancellation prevents stale worker results and timeout terminates unsafe regex", async () => {
    const terminated = vi.fn();
    class StuckWorker {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate = terminated;
    }
    const document = await model("aaaa");
    vi.stubGlobal("Worker", StuckWorker);
    vi.useFakeTimers();
    try {
      const controller = new AbortController(),
        pending = document.search(
          {
            query: "(a+)+$",
            regex: true,
            caseSensitive: false,
            wholeWord: false,
          },
          controller.signal,
          () => {},
        );
      const rejected = expect(pending).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(4001);
      await rejected;
      expect(terminated).toHaveBeenCalledOnce();
      const task = new AbortController(),
        cancelled = document.search(
          { query: "a", regex: false, caseSensitive: false, wholeWord: false },
          task.signal,
          () => {},
        );
      task.abort();
      await expect(cancelled).rejects.toHaveProperty("name", "AbortError");
      expect(terminated).toHaveBeenCalledTimes(2);
    } finally {
      document.dispose();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
