import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
export interface MediaLease {
  url: string;
  release(): void;
  backend: "browser-blob" | "native-range";
}
export async function createMediaSource(
  context: ViewerContext,
): Promise<MediaLease> {
  const type = context.file.mimeType ?? "application/octet-stream";
  if (context.source.getMediaUrl) {
    const lease = await context.source.getMediaUrl(type);
    return { ...lease, backend: "native-range" };
  }
  // Browser File.slice is zero-copy. Generic virtual sources have a finite copy budget.
  const maxBytes =
    context.source.zeroCopyBlob ? 8 * 1024 * 1024 * 1024 : 64 * 1024 * 1024;
  if (!context.source.readBlob)
    throw Error("This virtual source has no seekable media backend.");
  const blob = await context.source.readBlob({ type, maxBytes });
  checkAbort(context.signal);
  const url = URL.createObjectURL(blob);
  let live = true;
  return {
    url,
    backend: "browser-blob",
    release() {
      if (live) {
        live = false;
        URL.revokeObjectURL(url);
      }
    },
  };
}
