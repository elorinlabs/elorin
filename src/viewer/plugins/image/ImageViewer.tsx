import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import {ViewerDiagnostic} from '../../components/ViewerDiagnostic';
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { ImageModel, AnimationFrame } from "./image-model";
import { useBinaryActivity } from '../hex/activity';
import {
  anchoredZoom,
  fitZoom,
  imageCoordinates,
  initialImageView,
  type ImageViewState,
} from "./viewport";

export function ImageViewer({
  model,
  context,
  session,
  updateSession,
  activeCapability,
}: ViewerRenderProps<ImageModel>) {
  useLocale();
  const active = useBinaryActivity(context.active ?? true);
  const [view, setView] = useState<ImageViewState>(() => ({
    ...initialImageView,
    ...(session.metadata.imageView as Partial<ImageViewState>),
  }));
  const [visible, setVisible] = useState(true),
    [notice, setNotice] = useState("");
  const container = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    viewRef = useRef(view),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    fade = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  viewRef.current = view;
  const sessionRef = useRef(session),
    updateRef = useRef(updateSession);
  sessionRef.current = session;
  updateRef.current = updateSession;
  const commit = useCallback((next: ImageViewState) => {
    viewRef.current = next;
    setView(next);
    updateRef.current({
      metadata: { ...sessionRef.current.metadata, imageView: next },
    });
  }, []);
  const reveal = () => {
    setVisible(true);
    clearTimeout(fade.current);
    fade.current = setTimeout(() => setVisible(false), 2500);
  };
  const fit = useCallback(
    (mode: "fit" | "width" | "actual") => {
      const rect = container.current?.getBoundingClientRect();
      if (!rect) return;
      const current = viewRef.current,
        swapped = Math.abs(current.rotation % 180) === 90;
      commit({
        ...current,
        zoom:
          mode === "actual"
            ? 1
            : fitZoom(
                swapped ? model.height : model.width,
                swapped ? model.width : model.height,
                rect.width,
                rect.height,
                mode,
              ),
        x: 0,
        y: 0,
        fit: mode,
      });
    },
    [commit, model],
  );
  const draw = useCallback((image: CanvasImageSource) => {
    const node = canvas.current;
    if (!node) return;
    const paint = node.getContext("2d", { willReadFrequently: true });
    if (!paint) return;
    paint.clearRect(0, 0, node.width, node.height);
    paint.drawImage(image, 0, 0, node.width, node.height);
  }, []);
  useEffect(() => {
    if (canvas.current) {
      canvas.current.width = model.previewWidth;
      canvas.current.height = model.previewHeight;
    }
    if (model.drawable) draw(model.drawable);
  }, [model, draw]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (viewRef.current.fit !== "custom") fit(viewRef.current.fit);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = node.getBoundingClientRect();
      commit(
        anchoredZoom(
          viewRef.current,
          viewRef.current.zoom * Math.exp(-event.deltaY * 0.0015),
          event.clientX - box.left - box.width / 2,
          event.clientY - box.top - box.height / 2,
        ),
      );
      reveal();
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [commit]);
  useEffect(() => () => clearTimeout(fade.current), []);
  useEffect(() => {
    if (activeCapability === "zoom") {
      container.current?.focus();
      setVisible(true);
      setNotice(tr("Scroll to zoom · drag to pan · 0 to fit · 1 for actual size"));
    }
  }, [activeCapability]);
  useEffect(() => {
    const node = canvas.current;
    return () => {
      if (node) node.width = node.height = 0;
    };
  }, []);
  useEffect(() => {
    const decoder = model.decoder;
    if (!decoder || !active) return;
    let canceled = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      current: AnimationFrame["image"] | undefined;
    const count = model.metadata.frames ?? 1;
    const saved = sessionRef.current.metadata.imageCursor as
      | { next: number; shown: number; cycles: number; ended: boolean }
      | undefined;
    const cursor = { next: 0, shown: 0, cycles: 0, ended: false, ...saved };
    cursor.next = Math.max(0, Math.floor(cursor.next)) % count;
    cursor.shown = Math.max(0, Math.floor(cursor.shown)) % count;
    if (view.playing && cursor.ended) {
      cursor.next = 0;
      cursor.cycles = 0;
      cursor.ended = false;
    }
    const exhausted = () =>
      Number.isFinite(model.metadata.loop) &&
      cursor.cycles > (model.metadata.loop ?? 0);
    const finish = () => {
      cursor.ended = true;
      commit({ ...viewRef.current, playing: false });
    };
    const show = async (index: number) => {
      const result = await decoder.decode({ frameIndex: index });
      if (canceled) {
        result.image.close();
        return undefined;
      }
      current?.close();
      current = result.image;
      draw(current);
      cursor.shown = index;
      return Math.max(20, (current.duration ?? 100000) / 1000);
    };
    const tick = async () => {
      if (canceled || document.hidden || !viewRef.current.playing) return;
      try {
        if (exhausted()) {
          finish();
          return;
        }
        const delay = await show(cursor.next);
        if (delay === undefined) return;
        cursor.next = (cursor.next + 1) % count;
        if (cursor.next === 0) cursor.cycles++;
        timer = setTimeout(exhausted() ? finish : tick, delay);
      } catch {
        if (!canceled)
          setNotice(
            tr("Animation decoder stopped. The current frame is retained."),
          );
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden && viewRef.current.playing) {
        if (exhausted()) finish();
        else void tick();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    if (view.playing) void tick();
    else void show(cursor.shown).catch(() => {});
    return () => {
      canceled = true;
      clearTimeout(timer);
      current?.close();
      updateRef.current({
        metadata: {
          ...sessionRef.current.metadata,
          imageCursor: { ...cursor },
        },
      });
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [model, view.playing, draw, commit, active]);
  const sample = (event: React.PointerEvent) => {
    const node = container.current,
      pixels = canvas.current;
    if (!node || !pixels || model.metadata.format === "svg") return;
    const rect = node.getBoundingClientRect(),
      point = imageCoordinates(
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2,
        model.width,
        model.height,
        viewRef.current,
      );
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= model.width ||
      point.y >= model.height
    )
      return;
    const rgba = pixels
      .getContext("2d")!
      .getImageData(
        Math.min(
          pixels.width - 1,
          Math.floor((point.x / model.width) * pixels.width),
        ),
        Math.min(
          pixels.height - 1,
          Math.floor((point.y / model.height) * pixels.height),
        ),
        1,
        1,
      ).data;
    const hex =
      "#" +
      Array.from(rgba.slice(0, 3))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    updateSession({
      metadata: {
        ...session.metadata,
        imageView: viewRef.current,
        imagePixel: { ...point, hex, rgba: Array.from(rgba) },
      },
    });
  };
  const copy = async () => {
    try {
      const pixels = canvas.current;
      if (!pixels) throw new Error("No raster preview");
      const png = await new Promise<Blob>((resolve, reject) =>
        pixels.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Copy failed"))),
          "image/png",
        ),
      );
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setNotice(
        model.reduced
          ? tr("Reduced preview copied as PNG.")
          : tr("Image copied as PNG."),
      );
    } catch {
      setNotice(tr("Image clipboard is unavailable in this runtime."));
    }
  };
  return (
    <div
      ref={container}
      className={`image-viewer image-bg-${view.background}`}
      tabIndex={0}
      aria-label={tr("Image viewer")}
      onPointerMove={(event) => {
        reveal();
        if (drag.current) {
          const start = drag.current;
          commit({
            ...viewRef.current,
            x: start.px + event.clientX - start.x,
            y: start.py + event.clientY - start.y,
            fit: "custom",
          });
        } else sample(event);
      }}
      onPointerDown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            ".image-controls,button,select,a,summary,input",
          )
        )
          return;
        container.current?.focus();
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          px: view.x,
          py: view.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => fit(view.fit === "actual" ? "fit" : "actual")}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).matches("select,input,button"))
          return;
        if (["+", "=", "-", "0", "1", "r", "R"].includes(event.key)) {
          event.preventDefault();
          reveal();
          if (event.key === "0") fit("fit");
          else if (event.key.toLowerCase() === "r") {
            viewRef.current = { ...viewRef.current, rotation: 0 };
            fit("fit");
          } else if (event.key === "1") fit("actual");
          else
            commit(
              anchoredZoom(
                viewRef.current,
                view.zoom * (event.key === "-" ? 0.8 : 1.25),
                0,
                0,
              ),
            );
        }
      }}
    >
      {model.error ? (
        <div className="image-error">
          <h2>{tr("Unable to preview image")}</h2>
          <ViewerDiagnostic error={model.error}/>
          {context.file.isText && (
            <button onClick={() => context.openViewer?.("core.text-fallback")}>
              {tr("Open as Text")}</button>
          )}
          {context.services.file.openExternal && (
            <button onClick={() => void context.services.file.openExternal?.()}>
              {tr("Open externally")}</button>
          )}
        </div>
      ) : (
        <>
          <canvas
            ref={canvas}
            width={model.previewWidth}
            height={model.previewHeight}
            aria-label={tr("Decoded image")}
            hidden={!!model.vectorUrl}
            style={{
              width: model.width,
              height: model.height,
              transform: `translate(-50%,-50%) translate(${view.x}px,${view.y}px) rotate(${view.rotation}deg) scale(${view.zoom})`,
              imageRendering:
                view.pixelated || view.zoom > 4 ? "pixelated" : "auto",
            }}
          />
          {model.vectorUrl && (
            <img
              src={model.vectorUrl}
              alt={tr("Sanitized SVG preview")}
              draggable={false}
              style={{
                width: model.width,
                height: model.height,
                transform: `translate(-50%,-50%) translate(${view.x}px,${view.y}px) rotate(${view.rotation}deg) scale(${view.zoom})`,
              }}
            />
          )}
        </>
      )}
      {!model.error && (
        <div
          className={`image-controls ${visible ? "" : "image-controls-hidden"}`}
          onPointerEnter={() => {
            clearTimeout(fade.current);
            setVisible(true);
          }}
        >
          <button
            onClick={() =>
              commit(anchoredZoom(viewRef.current, view.zoom * 0.8, 0, 0))
            }
            aria-label={tr("Zoom out")}
          >
            −
          </button>
          <span>{(view.zoom * 100).toFixed(view.zoom < 0.1 ? 1 : 0)}%</span>
          <button
            onClick={() =>
              commit(anchoredZoom(viewRef.current, view.zoom * 1.25, 0, 0))
            }
            aria-label={tr("Zoom in")}
          >
            +
          </button>
          <button onClick={() => fit("fit")}>{tr("Fit")}</button>
          <button onClick={() => fit("actual")}>100%</button>
          {model.decoder && (
            <button onClick={() => commit({ ...view, playing: !view.playing })}>
              {view.playing ? tr("Pause") : tr("Play")}
            </button>
          )}
          <details className="image-more">
            <summary>{tr("More")}</summary>
            <div className="image-more-menu">
              <button onClick={() => fit("width")}>{tr("Fit width")}</button>
              <button
                onClick={() =>
                  commit({
                    ...view,
                    rotation: (view.rotation + 90) % 360,
                    fit: "custom",
                  })
                }
              >
                {tr("Rotate")}</button>
              <select
                aria-label={tr("Image background")}
                value={view.background}
                onChange={(event) =>
                  commit({
                    ...view,
                    background: event.target
                      .value as ImageViewState["background"],
                  })
                }
              >
                <option value="checker">{tr("Checkerboard")}</option>
                <option value="light">{tr("Light")}</option>
                <option value="dark">{tr("Dark")}</option>
                <option value="tone">{tr("Tone")}</option>
              </select>
              <button
                onClick={() => commit({ ...view, pixelated: !view.pixelated })}
                aria-pressed={view.pixelated}
              >
                {tr("Pixels")}</button>
              <button onClick={() => void copy()} disabled={!!model.error}>
                {tr("Copy image")}</button>
              <button
                onClick={() => {
                  const node = container.current;
                  if (document.fullscreenElement)
                    void document
                      .exitFullscreen()
                      .catch(() => setNotice(tr("Fullscreen is unavailable.")));
                  else
                    void node
                      ?.requestFullscreen()
                      .catch(() => setNotice(tr("Fullscreen is unavailable.")));
                }}
              >
                {tr("Fullscreen")}</button>
            </div>
          </details>
          {model.metadata.format === "svg" && (
            <button onClick={() => context.openViewer?.("core.text-fallback")}>
              {tr("Source")}</button>
          )}
        </div>
      )}
      {(model.warnings.length > 0 || notice) && (
        <div className="image-notice" role="status">
          {notice ? tr(notice) : model.warnings.map(w=>tr(w)).join(' ')}
        </div>
      )}
    </div>
  );
}
