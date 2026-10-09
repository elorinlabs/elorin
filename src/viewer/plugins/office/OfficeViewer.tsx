import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { Block, OfficeModel, Run } from "./office-model";
import { classifyMarkdownLink } from "../markdown/markdown-links";
function Runs({
  runs,
  query,
  onLink,
}: {
  runs: Run[];
  query: string;
  onLink: (url: string) => void;
}) {
  useLocale();
  return (
    <>
      {runs.map((run, i) => {
        let content: React.ReactNode = run.text;
        if (query) {
          const pieces = run.text.split(
            new RegExp(
              `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
              "gi",
            ),
          );
          content = pieces.map((part, n) =>
            part.toLocaleLowerCase() === query.toLocaleLowerCase() ? (
              <mark key={n}>{part}</mark>
            ) : (
              part
            ),
          );
        }
        if (run.image)
          return (
            <img
              key={i}
              loading="lazy"
              src={run.image}
              alt={run.alt ?? tr("Embedded image")}
            />
          );
        const span = (
          <span
            style={{
              fontWeight: run.bold ? 700 : undefined,
              fontStyle: run.italic ? "italic" : undefined,
              textDecoration: run.underline ? "underline" : undefined,
              color: run.color,
              fontSize: run.size ? `${run.size}pt` : undefined,
              fontFamily: run.font ? `"${run.font}",sans-serif` : undefined,
            }}
          >
            {content}
          </span>
        );
        return run.link ? (
          <button
            className="document-link"
            key={i}
            onClick={() => onLink(run.link!)}
          >
            {span}
          </button>
        ) : (
          <span key={i}>{span}</span>
        );
      })}
    </>
  );
}
function DocumentBlock({
  block,
  query,
  onLink,
}: {
  block: Block;
  query: string;
  onLink: (url: string) => void;
}) {
  useLocale();
  const content = (
    <>
      {block.list && <span className="document-bullet">{block.list} </span>}
      <Runs runs={block.runs} query={query} onLink={onLink} />
    </>
  );
  if (block.kind === "table")
    return (
      <div className="document-table">
        <table>
          <tbody>
            {block.rows?.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>
                    <Runs runs={cell.runs} query={query} onLink={onLink} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (block.kind === "heading") {
    const Tag = `h${block.level ?? 2}` as "h1";
    return (
      <Tag id={block.anchor} style={{ textAlign: block.align }}>
        {content}
      </Tag>
    );
  }
  return (
    <p
      id={block.anchor}
      className={block.pageBreak ? "document-page-break" : undefined}
      style={{ textAlign: block.align, whiteSpace: "pre-wrap" }}
    >
      {content}
    </p>
  );
}
export function OfficeViewer({
  model,
  context,
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<OfficeModel>) {
  useLocale();
  const [query, setQuery] = useState(
      String(session.metadata.documentQuery ?? ""),
    ),
    [panel, setPanel] = useState(String(session.metadata.documentPanel ?? "")),
    [result, setResult] = useState(
      Number(session.metadata.documentResult) || 0,
    ),
    [limit, setLimit] = useState(
      Math.max(
        100,
        Math.min(
          model.blocks.length,
          Number(session.metadata.documentLimit) || 100,
        ),
      ),
    ),
    [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null),
    firstQuery = useRef(true);
  const sentinel = useRef<HTMLButtonElement>(null);
  const focus = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => {});
  };
  const headings = model.blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.kind === "heading"),
    matches = useMemo(() => {
      const hits: {
        index: number;
        cell?: number;
        start: number;
        end: number;
      }[] = [];
      if (!query) return hits;
      const needle = query.toLocaleLowerCase();
      for (let index = 0; index < model.blocks.length; index++) {
        const block = model.blocks[index],
          sections = block.rows ? block.rows.flat() : [block];
        for (let cell = 0; cell < sections.length; cell++) {
          const text = sections[cell].runs
            .map((run) => run.text)
            .join("")
            .toLocaleLowerCase();
          for (
            let at = 0;
            (at = text.indexOf(needle, at)) >= 0;
            at += Math.max(1, needle.length)
          ) {
            hits.push({
              index,
              cell: block.rows ? cell : undefined,
              start: at,
              end: at + query.length,
            });
            if (hits.length >= 10000) return hits;
          }
        }
      }
      return hits;
    }, [model, query]);
  const go = (index: number) => {
    setLimit((old) => Math.max(old, index + 20));
    setTimeout(
      () =>
        root.current
          ?.querySelector(`[data-block="${index}"]`)
          ?.scrollIntoView({ block: "center" }),
      0,
    );
  };
  const onLink = (url: string) => {
    const link = classifyMarkdownLink(url);
    if (link.kind === "anchor") {
      const index = model.blocks.findIndex(
        (block) => block.anchor === link.target,
      );
      if (index >= 0) go(index);
      else setMessage(tr("This bookmark is unavailable."));
    } else if (link.kind === "external") {
      if (context.services.file.openUrl)
        void context.services.file
          .openUrl(link.target)
          .catch(() => setMessage(tr("This link could not be opened.")));
      else setMessage(tr("External links are unavailable in this mode."));
    } else if (link.kind === "relative") {
      if (context.services.file.openRelated)
        void context.services.file
          .openRelated(link.target)
          .catch(() => setMessage(tr("Related file is unavailable.")));
      else setMessage(tr("Related files require desktop mode."));
    } else setMessage(tr("This link is blocked."));
  };
  useEffect(() => {
    if (activeCapability === "outline") setPanel("outline");
    if (activeCapability === "search") setPanel("search");
    if (activeCapability === "inspect") setPanel("");
  }, [activeCapability]);
  useEffect(() => {
    if (activeCapability === "fullscreen") focus();
  }, [activeCapability]);
  useEffect(() => {
    updateSession({ metadata: { ...session.metadata, documentPanel: panel } });
  }, [panel]);
  useEffect(() => {
    updateSession({ metadata: { ...session.metadata, documentLimit: limit } });
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setLimit((old) => Math.min(model.blocks.length, old + 100));
      },
      { root: root.current?.closest(".viewer-scroll"), rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit]);
  useEffect(() => {
    if (firstQuery.current) firstQuery.current = false;
    else setResult(0);
    updateSession({ metadata: { ...session.metadata, documentQuery: query } });
  }, [query]);
  useEffect(() => {
    updateSession({
      metadata: { ...session.metadata, documentResult: result },
    });
    const hit = matches[result];
    if (!hit || !root.current) {
      CSS.highlights?.delete("prism-document-search");
      return;
    }
    const section = root.current.querySelector(`[data-block="${hit.index}"]`),
      target =
        hit.cell === undefined
          ? section
          : section?.querySelectorAll("td")[hit.cell];
    if (!target) return;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT),
      range = document.createRange();
    let offset = 0,
      start = false,
      end = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest(".document-bullet")) continue;
      const length = node.textContent?.length ?? 0;
      if (!start && offset + length > hit.start) {
        range.setStart(node, hit.start - offset);
        start = true;
      }
      if (offset + length >= hit.end) {
        range.setEnd(node, hit.end - offset);
        end = true;
        break;
      }
      offset += length;
    }
    if (start && end && typeof Highlight !== "undefined")
      CSS.highlights?.set("prism-document-search", new Highlight(range));
    return () => {
      CSS.highlights?.delete("prism-document-search");
    };
  }, [query, result, limit, matches]);
  if (model.legacy || model.error)
    return (
      <div className="document-message">
        <h2>
          {model.legacy
            ? tr("Legacy Word document")
            : tr("Document preview unavailable")}
        </h2>
        <p>
          {model.legacy
            ? tr("Rich preview is unavailable for this .doc file. Use a system app to view the original document.")
            : model.error}
        </p>
        <button
          disabled={!context.services.file.openExternal}
          onClick={() => context.services.file.openExternal?.()}
        >
          {tr("Open with system app")}</button>
      </div>
    );
  return (
    <div
      className="office-viewer"
      ref={root}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === "f") {
          e.preventDefault();
          setPanel("search");
        }
      }}
    >
      <div className="document-toolbar">
        <button onClick={() => setPanel(panel === "outline" ? "" : "outline")}>
          {tr("Contents")}</button>
        <button onClick={() => setPanel(panel === "search" ? "" : "search")}>
          {tr("Find")}</button>
        <span>{tr("Reading layout ·")}{' '}{model.format.toUpperCase()}</span>
        <button onClick={focus}>{tr("Focus")}</button>
      </div>
      {panel === "search" && (
        <div className="document-search">
          <input
            aria-label={tr("Search document")}
            placeholder={tr("Find in document")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>
            {matches.length} {tr("matches")}{matches.length ? tr(" · {v0}/{v1}", { v0: result + 1, v1: matches.length }) : ""}
          </span>
          {[-1, 1].map((delta) => (
            <button
              key={delta}
              aria-label={delta < 0 ? tr("Previous result") : tr("Next result")}
              disabled={!matches.length}
              onClick={() => {
                const next = (result + delta + matches.length) % matches.length;
                setResult(next);
                go(matches[next].index);
              }}
            >
              {delta < 0 ? "‹" : "›"}
            </button>
          ))}
          <button onClick={() => setPanel("")}>{tr("Close")}</button>
        </div>
      )}
      <div className="document-layout">
        {panel === "outline" && (
          <aside className="document-sidebar" aria-label={tr("Document outline")}>
            {headings.length ? (
              headings.map(({ block, index }) => (
                <button
                  key={index}
                  style={{ paddingLeft: (block.level ?? 1) * 10 }}
                  onClick={() => go(index)}
                >
                  {block.runs.map((run) => run.text).join("")}
                </button>
              ))
            ) : (
              <p>{tr("No document headings")}</p>
            )}
          </aside>
        )}
        <main className="office-paper">
          {model.warnings.length > 0 && (
            <details className="document-warnings">
              <summary>{tr("Preview notes (")}{model.warnings.length})</summary>
              {model.warnings.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </details>
          )}
          {message && <p role="status">{tr(message)}</p>}
          {model.blocks.slice(0, limit).map((block, i) => (
            <section
              key={i}
              data-block={i}
              className={
                matches[result]?.index === i
                  ? "document-active-result"
                  : undefined
              }
            >
              <DocumentBlock block={block} query={query} onLink={onLink} />
            </section>
          ))}
          {limit < model.blocks.length && (
            <button
              ref={sentinel}
              className="document-more"
              onClick={() => setLimit((old) => old + 100)}
            >
              {tr("Load next sections ·")}{model.blocks.length - limit} {tr("remaining")}</button>
          )}
          {!model.blocks.length && <p>{tr("No readable document content found.")}</p>}
        </main>
      </div>
    </div>
  );
}
export function OfficeInspector({ model }: { model: OfficeModel }) {
  useLocale();
  return (
    <div className="document-inspector">
      <h3>{tr("Document")}</h3>
      <dl>
        <dt>{tr("Format")}</dt>
        <dd>{model.format.toUpperCase()}</dd>
        <dt>{tr("Layout")}</dt>
        <dd>{tr("Flow reading; original page count unavailable")}</dd>
        <dt>{tr("Sections")}</dt>
        <dd>{model.blocks.length}</dd>
        {Object.entries(model.metadata).map(([key, value]) => (
          <div key={key}>
            <dt>{tr(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h4>{tr("Embedded objects")}</h4>
      {model.attachments.length ? (
        model.attachments.map((name) => (
          <p key={name}>{name} {' '}{tr("· preview unavailable")}</p>
        ))
      ) : (
        <p>{tr("None detected")}</p>
      )}
      {model.warnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
    </div>
  );
}
