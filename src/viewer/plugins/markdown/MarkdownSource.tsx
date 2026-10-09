import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import type { MarkdownDocumentModel } from "./markdown-model";
export function MarkdownSource({ model }: { model: MarkdownDocumentModel }) {
  useLocale();
  return (
    <div className="markdown-source" aria-label={tr("Markdown source")}>
      <pre className="markdown-line-numbers" aria-hidden="true">
        {model.sourceLines.map((_, index) => index + 1).join("\n")}
      </pre>
      <pre
        className="markdown-source-text"
        tabIndex={0}
        aria-label={tr("Read-only Markdown source")}
      >
        {model.source}
      </pre>
    </div>
  );
}
