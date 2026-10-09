import { diffLines } from 'diff';
self.onmessage = ({data}: MessageEvent<{left: string; right: string}>) => {
  try { const parts = diffLines(data.left, data.right, { timeout: 3000, maxEditLength: 20000 }); if (!parts) throw Error('Compare exceeded its complexity limit.'); const count = parts.reduce((n,p) => n + (p.count ?? 0),0); if (count > 40000) throw Error('Too many lines to display. Compare smaller files.'); self.postMessage({ parts }); } catch (e) { self.postMessage({ error: String(e) }); }
};
