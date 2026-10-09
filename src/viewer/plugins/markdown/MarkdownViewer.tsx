import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ViewerRenderProps } from "../../core/types";
import { MarkdownReader } from "./MarkdownReader";
import { MarkdownSource } from "./MarkdownSource";
import type { MarkdownModel } from "./markdown.plugin";
export function MarkdownViewer({
  model,
  context,
  mode = "read",
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<MarkdownModel>) {
  useLocale();
  const reading = useRef<HTMLDivElement>(null),
    source = useRef<HTMLDivElement>(null);
  const presentation = activeCapability === "source" ? "source" : mode;
  // Scroll writes mutate session metadata directly, avoiding a document rerender for every scroll event.
  useLayoutEffect(() => {
    const readingPane = reading.current,
      sourcePane = source.current;
    if (readingPane)
      readingPane.scrollTop = Number(
        (presentation === "split"
          ? session.metadata.splitReadingScroll
          : session.metadata.readingScroll) ?? session.metadata.readingScroll ?? 0,
      );
    if (sourcePane)
      sourcePane.scrollTop = Number(
        (presentation === "split"
          ? session.metadata.splitSourceScroll
          : session.metadata.sourceScroll) ?? session.metadata.sourceScroll ?? 0,
      );
  }, [presentation, activeCapability, session]);
  useEffect(()=>{const navigate=(event:Event)=>{const{source:target,hit}=(event as CustomEvent).detail;if(target!==context.source)return;updateSession({mode:'source',metadata:{...session.metadata,sourceScroll:Math.max(0,(hit.line-3)*24)}});};window.addEventListener('elorin-navigate-search',navigate);return()=>window.removeEventListener('elorin-navigate-search',navigate);},[context.source,session]);
  return (
    <div className={`markdown-viewer markdown-${presentation}`}>
      {presentation !== "source" && (
        <div
          key="reading"
          ref={reading}
          className="markdown-reader-pane"
          onScroll={(event) => {
            session.metadata[
              presentation === "split" ? "splitReadingScroll" : "readingScroll"
            ] = event.currentTarget.scrollTop;
          }}
        >
          <header className="code-pane-heading"><strong>{context.file.name}</strong><span>{tr("Preview")}</span></header>
          <MarkdownReader
            model={model}
            context={context}
            resources={model.resources}
          />
        </div>
      )}
      {presentation !== "read" && (
        <div
          key="source"
          ref={source}
          className="markdown-source-pane"
          onScroll={(event) => {
            session.metadata[
              presentation === "split" ? "splitSourceScroll" : "sourceScroll"
            ] = event.currentTarget.scrollTop;
          }}
        >
          <header className="code-pane-heading"><strong>{context.file.name}</strong><span>{tr("Source")}</span></header>
          <MarkdownSource model={model} />
        </div>
      )}
    </div>
  );
}
