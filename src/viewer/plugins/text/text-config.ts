export const TEXT_CONFIG = {
  smallBytes: 2 * 1024 * 1024,
  mediumBytes: 20 * 1024 * 1024,
  largeBytes: 200 * 1024 * 1024,
  chunkBytes: 256 * 1024,
  checkpointLines: 256,
  maxCheckpoints: 32768,
  previewChars: 4096,
  highlightChars: 2048,
  linePageBytes: 16 * 1024,
  copyBytes: 1024 * 1024,
  searchResults: 2000,
  regexLineChars: 64 * 1024,
  workerTimeoutMs: 4000,
  rowHeight: 24,
  viewportRows: 40,
  overscan: 8,
  maxScrollPixels: 8_000_000,
} as const;
export function textSizeClass(bytes: number) {
  return bytes < TEXT_CONFIG.smallBytes
    ? "Small"
    : bytes < TEXT_CONFIG.mediumBytes
      ? "Medium"
      : bytes < TEXT_CONFIG.largeBytes
        ? "Large"
        : "Very Large";
}
