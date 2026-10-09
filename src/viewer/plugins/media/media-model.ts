import type { ViewerContext } from "../../core/types";
import type { IAudioMetadata } from "music-metadata";
import { createMediaSource, type MediaLease } from "./media-source";
import {
  probeMedia,
  codecCapability,
  type CodecCapability,
} from "./media-probe";
import { PlaybackController } from "./PlaybackController";
import { OfficePackage } from "../office/OfficePackage";
export interface MediaModel {
  kind: "audio" | "video";
  controller?: PlaybackController;
  lease?: MediaLease;
  metadata?: IAudioMetadata;
  probe?: Promise<void>;
  cover?: string;
  capability: CodecCapability;
  error?: string;
  diagnostics: string[];
  attached: boolean;
  dispose: () => void;
}
const live = new WeakMap<object, MediaModel>();
export async function loadMedia(
  context: ViewerContext,
  kind: "audio" | "video",
): Promise<MediaModel> {
  const existing = live.get(context.file);
  if (existing && existing.controller) {
    existing.attached = true;
    context.onCleanup(() => detach(existing));
    return existing;
  }
  const m: MediaModel = {
    kind,
    capability: "unknown",
    diagnostics: [],
    attached: true,
    dispose: () => {},
  };
  try {
    const lease = await createMediaSource(context);
    m.lease = lease;
    const e = document.createElement(kind);
    e.preload = "metadata";
    e.controls = false;
    e.setAttribute("controlsList", "nodownload noremoteplayback");
    e.setAttribute("disablePictureInPicture", "");
    e.setAttribute("playsinline", "");
    e.src = lease.url;
    m.controller = new PlaybackController(e);
    m.capability = codecCapability(e, context.file.mimeType ?? "");
    const urls: (() => void)[] = [];
    let disposed = false;
    m.dispose = () => {
      if (disposed) return;
      disposed = true;
      m.controller?.dispose();
      lease.release();
      urls.forEach((f) => f());
      m.cover=undefined;m.metadata=undefined;
      live.delete(context.file);
    };
    live.set(context.file, m);
    context.onCleanup(() => detach(m));
    e.addEventListener("ended", () => {
      if (!m.attached) m.dispose();
    });
    e.addEventListener("pause", () => {
      if (!m.attached)
        queueMicrotask(() => {
          if (!m.attached && e.paused) m.dispose();
        });
    });
    m.probe = probeMedia(context)
      .then((metadata) => {
        if (disposed || context.signal.aborted) return;
        m.metadata = metadata;
        const cover = metadata.common.picture?.[0];
        if (cover && cover.data.length <= 8 * 1024 * 1024) {
          const extension =
            cover.format.split("/").pop()?.replace("jpg", "jpeg") ?? "png";
          const entries = new Map([[`cover.${extension}`, cover.data]]);
          const pkg = new OfficePackage(entries, {
            ...context,
            onCleanup: (f) => urls.push(f),
          });
          m.cover = pkg.image(`cover.${extension}`);
        }
      })
      .catch((error) => {
        if (!disposed && !context.signal.aborted)
          m.diagnostics.push(
            `Metadata: ${error instanceof Error ? error.message : "unavailable"}`,
          );
      });
  } catch (e) {
    m.error = e instanceof Error ? e.message : "Media source unavailable.";
  }
  return m;
}
function detach(m: MediaModel) {
  m.attached = false;
  m.dispose();
}
