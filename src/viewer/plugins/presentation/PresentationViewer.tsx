import { formatNumber } from "../../../i18n";
import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import {
  loadSlide,
  type Presentation,
  type Shape,
  type Slide,
} from "./presentation-model";
export function PresentationInspector({ model }: { model: Presentation }) {
  useLocale();
  const names = [...(model.pkg?.entries.keys() ?? [])];
  return (
    <div className="m10-inspector">
      <h4>{tr("Presentation")}</h4>
      <p>{model.pkg ? formatNumber(model.pkg.context.file.size) : "—"} {' '}{tr("bytes")}</p>
      <p>
        {model.slides.length} {' '}{tr("slides •")}{' '}{model.width} × {model.height} •{" "}
        {(model.width / model.height).toFixed(3)} {tr("ratio")}</p>
      <p>
        {tr("Macros:")}{model.pkg?.macros ? tr("Present") : tr("Not detected")} {tr("• Execution Disabled by Prism")}</p>
      <p>
        {names.filter((n) => /\/media\//.test(n)).length} {' '}{tr("packaged media •")}{" "}
        {names.filter((n) => /\/charts\/chart\d+\.xml$/.test(n)).length} {tr("charts •")}{" "}
        {
          names.filter((n) => /\/notesSlides\/notesSlide\d+\.xml$/.test(n))
            .length
        }{" "}
        {tr("notes parts")}</p>
      <p>{tr("Animations, actions, embedded programs and media are inert.")}</p>
      <pre>
        {JSON.stringify(
          { metadata: model.pkg?.metadata, objects: model.pkg?.attachments },
          null,
          2,
        )}
      </pre>
    </div>
  );
}
function SlideCanvas({
  model,
  slide,
  onLink,
  thumbnail = false,
}: {
  model: Presentation;
  slide: Slide;
  onLink: (s: string) => void;
  thumbnail?: boolean;
}) {
  useLocale();
  function shape(s: Shape) {
    const style = {
      left: `${(s.x / model.width) * 100}%`,
      top: `${(s.y / model.height) * 100}%`,
      width: `${(s.width / model.width) * 100}%`,
      height: `${(s.height / model.height) * 100}%`,
      transform: `rotate(${s.rotation}deg)`,
      background:
        s.kind === "line" || s.kind === "arrow" ? "transparent" : s.fill,
      border: s.stroke === "transparent" ? undefined : `1px solid ${s.stroke}`,
      borderRadius: s.kind === "ellipse" ? "50%" : undefined,
    };
    return (
      <div
        key={s.id}
        className={`m10-shape m10-shape-${s.kind}`}
        style={style}
        onClick={s.link && !thumbnail ? () => onLink(s.link!) : undefined}
      >
        {s.kind === "image" && (
          <img
            src={model.pkg?.image(s.image!)}
            alt={tr("Embedded slide image")}
            draggable={false}
          />
        )}
        {s.kind === "placeholder" && (
          <div className="m10-placeholder">{s.label}</div>
        )}
        {(s.kind === "line" || s.kind === "arrow" || s.kind === "freeform") && (
          <svg
            viewBox={`0 0 ${Math.max(1, s.width)} ${Math.max(1, s.height)}`}
            preserveAspectRatio="none"
          >
            <path
              d={
                s.path ??
                `M0 ${s.height / 2} L${s.width} ${s.height / 2}${s.kind === "arrow" ? ` M${s.width - 12} ${s.height / 2 - 8} L${s.width} ${s.height / 2} L${s.width - 12} ${s.height / 2 + 8}` : ""}`
              }
              fill={s.kind === "freeform" ? s.fill : "none"}
              stroke={s.stroke === "transparent" ? "#555" : s.stroke}
            />
          </svg>
        )}
        {s.table && (
          <table>
            <tbody>
              {s.table.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {s.paragraphs.map((p, i) => (
          <p
            key={i}
            style={{ textAlign: p.align as "left", lineHeight: p.lineHeight }}
          >
            {p.bullet && "• "}
            {p.runs.map((r, j) => (
              <span
                key={j}
                style={{
                  fontSize: `${(r.size / model.width) * 100}cqw`,
                  fontFamily: r.font,
                  fontWeight: r.bold ? "bold" : undefined,
                  fontStyle: r.italic ? "italic" : undefined,
                  color: r.color,
                }}
              >
                {r.link && !thumbnail ? (
                  <button className="m10-link" onClick={() => onLink(r.link!)}>
                    {r.text}
                  </button>
                ) : (
                  r.text
                )}
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div
      className="m10-slide"
      style={{
        aspectRatio: `${model.width}/${model.height}`,
        background: slide.background,
      }}
    >
      {slide.shapes.map(shape)}
    </div>
  );
}
export function PresentationViewer({
  model,
  context,
  activeCapability,
  session,
  updateSession,
}: ViewerRenderProps<Presentation>) {
  useLocale();
  const [index, setIndex] = useState(
      Math.min(model.slides.length - 1, Number(session.metadata.slide) || 0),
    ),
    [slide, setSlide] = useState<Slide | undefined>(model.slides[index]),
    [rail, setRail] = useState(false),
    [railTop, setRailTop] = useState(0),
    [notes, setNotes] = useState(false),
    [inspect, setInspect] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [includeNotes, setIncludeNotes] = useState(false),
    [results, setResults] = useState<{ index: number; text: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [number, setNumber] = useState(String(index + 1)),
    [focus, setFocus] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 600 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setStageSize({
        width: Math.max(100, el.clientWidth - 40),
        height: Math.max(100, el.clientHeight - 40),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const section = useRef<HTMLElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    op = useRef(0);
  const [, refreshThumbnails] = useState(0);
  useEffect(() => {
    if (!rail || busy) return;
    let live = true;
    model.pinned = index;
    const start = Math.max(0, Math.floor(railTop / 130));
    void (async () => {
      for (let i = start; i < Math.min(model.slides.length, start + 3); i++) {
        if (!live || context.signal.aborted) return;
        try {
          await loadSlide(model, i, context.signal);
        } catch {
          return;
        }
      }
      if (live) refreshThumbnails((v) => v + 1);
    })();
    return () => {
      live = false;
    };
  }, [rail, railTop, index, busy]);
  useEffect(() => {
    if (slide && !slide.loaded) void go(index);
  }, []);
  useEffect(() => {
    if (activeCapability === "search") {
      setSearch(true);
      searchInput.current?.focus();
    }
    if (activeCapability === "outline") setRail(true);
    if (activeCapability === "inspect") setInspect(true);
  }, [activeCapability]);
  useEffect(
    () => () => {
      op.current++;
    },
    [],
  );
  async function go(n: number) {
    n = Math.max(0, Math.min(model.slides.length - 1, n));
    const token = ++op.current;
    model.pinned = n;
    setBusy(true);
    setError("");
    try {
      const s = await loadSlide(model, n, context.signal);
      if (token === op.current) {
        setSlide(s);
        setIndex(n);
        setNumber(String(n + 1));
        updateSession({ metadata: { ...session.metadata, slide: n } });
      }
    } catch (e) {
      if (!context.signal.aborted) setError(uiError(e));
    } finally {
      if (token === op.current) setBusy(false);
    }
  }
  async function external(link: string) {
    if (link.startsWith("slide:")) {
      const n = model.slides.findIndex((s) => s.path === link.slice(6));
      if (n >= 0) await go(n);
    } else if (
      /^https?:\/\//i.test(link) &&
      window.confirm(`Open external link?\n${link}`)
    )
      await context.services.file.openUrl?.(link);
  }
  async function find() {
    const token = ++op.current;
    setBusy(true);
    const found: typeof results = [];
    try {
      for (let i = 0; i < model.slides.length; i++) {
          if(token!==op.current||context.signal.aborted)return;
        const s = await loadSlide(model, i, context.signal);
          if(token!==op.current||context.signal.aborted)return;
        const text =
          s.shapes
            .map(
              (n) =>
                n.paragraphs
                  .map((p) => p.runs.map((r) => r.text).join(""))
                  .join("\n") +
                (n.table
                  ? "\n" + n.table.map((r) => r.join("\t")).join("\n")
                  : "") +
                (n.label ? "\n" + n.label : ""),
            )
            .join("\n") + (includeNotes ? `\n${s.notes}` : "");
        if (text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          found.push({ index: i, text: s.title });
        if (found.length >= 500) break;
      }
      if (token === op.current) {
        setResults(found);
          const current=await loadSlide(model, index, context.signal);
          if(token===op.current&&!context.signal.aborted)setSlide(current);
      }
    } catch (e) {
        if(token===op.current&&!context.signal.aborted)setError(uiError(e));
    } finally {
      if (token === op.current) setBusy(false);
    }
  }
  async function full() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFocus(false);
    } else {
      await section.current?.requestFullscreen();
      setFocus(true);
    }
  }
  useEffect(() => {
    const handler = () => setFocus(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  useEffect(() =>
    context.registerActions?.([
      { id: "inspect", get label() { return tr("Inspect"); }, action: () => setInspect((v) => !v) },
      { id: "search", get label() { return tr("Search"); }, action: () => setSearch((v) => !v) },
      {
        id: "thumbnails",
        get label() { return tr("Thumbnails / outline"); },
        action: () => setRail((v) => !v),
      },
      {
        id: "notes",
        get label() { return tr("Speaker notes"); },
        action: () => setNotes((v) => !v),
      },
      { id: "fullscreen", get label() { return tr("Focus / fullscreen"); }, action: full },
      {
        id: "copy",
        get label() { return tr("Copy slide text"); },
        action: () =>
          navigator.clipboard?.writeText(
            slide?.shapes
              .map((n) =>
                n.paragraphs
                  .map((p) => p.runs.map((r) => r.text).join(""))
                  .join("\n"),
              )
              .join("\n") ?? "",
          ),
      },
    ]),
  );
  if (model.error || model.limited)
    return (
      <div className="m10-message">
        <h3>
          {model.limited
            ? tr("Limited Preview")
            : tr("Presentation preview unavailable")}
        </h3>
        <p>{model.error ?? model.limited}</p>
        <button onClick={() => context.services.file.openExternal?.()}>
          {tr("Open externally")}</button>
      </div>
    );
  return (
    <section
      ref={section}
      tabIndex={0}
      className={`m10-viewer presentation-viewer ${focus ? "m10-focus" : ""}`}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        const key = e.key;
        if (
          [
            "ArrowRight",
            "PageDown",
            "ArrowLeft",
            "PageUp",
            "Home",
            "End",
          ].includes(key)
        ) {
          e.preventDefault();
          void go(
            key === "Home"
              ? 0
              : key === "End"
                ? model.slides.length - 1
                : index + (["ArrowRight", "PageDown"].includes(key) ? 1 : -1),
          );
        }
        if (key === "Escape") setFocus(false);
      }}
    >
      {search && (
        <div className="m10-search">
          <input
            ref={searchInput}
            aria-label={tr("Search presentation")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Find slide text…")}
          />
          <label>
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
            />{" "}
            {tr("Include notes")}</label>
          <button disabled={!query || busy} onClick={() => void find()}>
            {tr("Find")}</button>
            <button onClick={() => {op.current++;setBusy(false);setSearch(false);}}>{tr("Close")}</button>
        </div>
      )}
      {search && results.length > 0 && (
        <div className="m10-results">
          {results.map((r) => (
            <button key={r.index} onClick={() => void go(r.index)}>
              {tr("Slide")}{r.index + 1} — {r.text}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert">{tr(error)}</p>}
      <div className="m10-body">
        {rail && (
          <aside
            className="m10-rail"
            onScroll={(e) => setRailTop(e.currentTarget.scrollTop)}
          >
            <div
              style={{
                height: model.slides.length * 130,
                position: "relative",
              }}
            >
              {Array.from(
                {
                  length: Math.min(
                    10,
                    model.slides.length -
                      Math.max(0, Math.floor(railTop / 130) - 2),
                  ),
                },
                (_, j) => Math.max(0, Math.floor(railTop / 130) - 2) + j,
              ).map((i) => (
                <button
                  key={i}
                  className={i === index ? "selected" : ""}
                  style={{
                    position: "absolute",
                    top: i * 130,
                    height: 122,
                    left: 0,
                    right: 0,
                  }}
                  onClick={() => void go(i)}
                >
                  {model.slides[i].loaded ? (
                    <SlideCanvas
                      thumbnail
                      model={model}
                      slide={model.slides[i]}
                      onLink={() => {}}
                    />
                  ) : (
                    <div className="m10-thumbnail-placeholder">{i + 1}</div>
                  )}
                  <span>
                    {i + 1}. {model.slides[i].title}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}
        <div
          ref={stage}
          className="m10-stage"
          aria-label={tr("Slide {v0}", { v0: index + 1 })}
        >
          {slide && (
            <div
              className="m10-slide-fit"
              style={{
                width: Math.min(
                  stageSize.width,
                  (stageSize.height * model.width) / model.height,
                ),
              }}
            >
              <SlideCanvas
                model={model}
                slide={slide}
                onLink={(s) => void external(s)}
              />
            </div>
          )}
        </div>
        {inspect && (
          <aside className="m10-inspector">
            <button onClick={() => setInspect(false)}>{tr("Close details")}</button>
            <h4>{slide?.title}</h4>
            <p>
              {slide?.textBoxes} {' '}{tr("text boxes •")}{' '}{slide?.images} {' '}{tr("images •")}{" "}
              {slide?.charts} {' '}{tr("charts •")}{' '}{slide?.tables} {tr("tables")}</p>
            <p>
              {slide?.audio} {' '}{tr("audio •")}{' '}{slide?.video} {' '}{tr("video •")}{' '}{slide?.objects}{" "}
              {tr("embedded objects")}</p>
            <p>{slide?.animations} {' '}{tr("timing / transition parts (static layout)")}</p>
            <p>{tr("Notes:")}{' '}{slide?.notes ? tr("Present") : tr("None")}</p>
            {slide?.comments.map((c, i) => (
              <p key={i}>{tr("Comment:")}{' '}{c}</p>
            ))}
            <PresentationInspector model={model} />
          </aside>
        )}
      </div>
      {notes && (
        <aside className="m10-notes">
          <strong>{tr("Speaker notes")}</strong>
          <p>{slide?.notes || tr("No notes on this slide.")}</p>
        </aside>
      )}
      <footer className="m10-controls">
        <button
          disabled={index <= 0 || busy}
          onClick={() => void go(index - 1)}
        >
          {tr("Previous")}</button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void go((Number(number) || 1) - 1);
          }}
        >
          <input
            aria-label={tr("Slide number")}
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <span> / {model.slides.length}</span>
          <button>{tr("Go")}</button>
        </form>
        <button
          disabled={index >= model.slides.length - 1 || busy}
          onClick={() => void go(index + 1)}
        >
          {tr("Next")}</button>
        <span className="m10-formula">
          {busy ? tr("Loading slide…") : slide?.title}
        </span>
        <button onClick={() => setRail((v) => !v)}>{tr("Thumbnails")}</button>
        <button onClick={() => setNotes((v) => !v)}>{tr("Notes")}</button>
        <button onClick={() => void full()}>{tr("Focus")}</button>
      </footer>
    </section>
  );
}
