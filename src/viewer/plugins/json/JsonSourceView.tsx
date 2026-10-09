import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { JsonDocumentModel } from "./json-model";
export function JsonSourceView({
  model,
  scrollTop,
  saveScroll,
  errorJump,
}: {
  model: JsonDocumentModel;
  scrollTop: number;
  saveScroll(top: number): void;
  errorJump: number;
}) {
  useLocale();
  const pane = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () =>
      model.source
        .split(/\r\n|\n|\r/)
        .map((_, i) => i + 1)
        .join("\n"),
    [model],
  );
  useLayoutEffect(() => {
    if (pane.current) pane.current.scrollTop = scrollTop;
  }, []);
  useLayoutEffect(() => {
    if (!errorJump || !pane.current) return;
    const line =
      model.diagnostics.find((item) => item.kind === "error")?.line ?? 1;
    pane.current.scrollTop = Math.max(0, (line - 3) * 22);
    pane.current.focus();
  }, [errorJump, model]);
  return (
    <div
      ref={pane}
      className="json-source-pane"
      tabIndex={0}
      aria-label={tr("JSON source")}
      onScroll={(event) => saveScroll(event.currentTarget.scrollTop)}
    >
      {model.truncated && (
        <p className="json-note">
          {tr("Bounded source preview · first 256 KiB of input")}</p>
      )}
      <div className="json-source-lines">
        <pre aria-hidden="true" className="json-line-numbers">
          {lines}
        </pre>
        <pre aria-label={tr("Read-only JSON source")}>{model.source}</pre>
      </div>
    </div>
  );
}
