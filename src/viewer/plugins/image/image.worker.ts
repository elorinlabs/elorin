import { pngPreview } from "./image-png";
import { decodeTiff } from "./image-tiff";
self.onmessage = (
  event: MessageEvent<{ kind: string; buffer: ArrayBuffer }>,
) => {
  try {
    const result =
      event.data.kind === "png"
        ? pngPreview(event.data.buffer)
        : decodeTiff(event.data.buffer);
    self.postMessage(
      { ok: true, ...result },
      { transfer: [result.rgba.buffer] },
    );
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Image decode failed.",
    });
  }
};
