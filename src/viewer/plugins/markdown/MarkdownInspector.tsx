import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import type { MarkdownStatistics } from "./markdown-model";
export function MarkdownInspector({
  statistics: s,
}: {
  statistics: MarkdownStatistics;
}) {
  useLocale();
  return (
    <section className="markdown-inspector" aria-label={tr("Markdown inspection")}>
      <p className="markdown-eyebrow">{tr("MARKDOWN")}</p>
      <h2>{tr("Document insights")}</h2>
      <dl>
        <dt>{tr("Words")}</dt>
        <dd>{formatNumber(s.words)}</dd>
        <dt>{tr("CJK characters")}</dt>
        <dd>{formatNumber(s.cjkCharacters)}</dd>
        <dt>{tr("Characters")}</dt>
        <dd>{formatNumber(s.characters)}</dd>
        <dt>{tr("Lines")}</dt>
        <dd>{formatNumber(s.lines)}</dd>
        <dt>{tr("Reading time")}</dt>
        <dd>{s.readingMinutes} {' '}{tr("min")}</dd>
      </dl>
      <h3>{tr("Structure")}</h3>
      <dl>
        <dt>{tr("Headings")}</dt>
        <dd>{s.headings}</dd>
        <dt>{tr("Links")}</dt>
        <dd>{s.links}</dd>
        <dt>{tr("Images")}</dt>
        <dd>{s.images}</dd>
        <dt>{tr("Code blocks")}</dt>
        <dd>{s.codeBlocks}</dd>
        <dt>{tr("Tables")}</dt>
        <dd>{s.tables}</dd>
      </dl>
    </section>
  );
}
