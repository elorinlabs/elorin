import type { ViewerPlugin } from "../../core/types";
import { loadMedia, type MediaModel } from "./media-model";
import { MediaViewer, MediaInspector } from "./MediaViewer";
import "../module11.css";
export const audioViewerPlugin: ViewerPlugin<MediaModel, MediaModel> = {
  id: "audio",
  suspension:'managed',
  name: "Audio",
  supportedTypes: [
    "mp3",
    "wav",
    "flac",
    "aac",
    "m4a",
    "ogg",
    "opus",
    "wma",
    "aiff",
  ],
  capabilities: { inspect: true },
  load: (c) => loadMedia(c, "audio"),
  render: (p) => <MediaViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <MediaInspector model={m} />,
};
export const videoViewerPlugin: ViewerPlugin<MediaModel, MediaModel> = {
  id: "video",
  suspension:'managed',
  name: "Video",
  supportedTypes: ["mp4", "webm", "mov", "mkv", "avi", "mpeg", "m4v"],
  capabilities: { inspect: true, fullscreen: true },
  load: (c) => loadMedia(c, "video"),
  render: (p) => <MediaViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <MediaInspector model={m} />,
};
