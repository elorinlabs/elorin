/** Keep budgets together; full parsing stays within the existing FileSource read limit. */
export const JSON_CONFIG = {
  maxBytes: 8 * 1024 * 1024,
  workerBytes: 256 * 1024,
  previewBytes: 256 * 1024,
  maxNodes: 250000,
  maxDepth: 256,
  maxPointerChars: 16 * 1024 * 1024,
  expandAllNodes: 5000,
  autoExpandNodes: 1000,
  stringPreview: 240,
  stringDetail: 16384,
  searchValueChars: 4096,
  searchResults: 500,
  searchDelay: 200,
  rowHeight: 36,
  overscan: 8,
  copyBytes: 1024 * 1024,
} as const;
