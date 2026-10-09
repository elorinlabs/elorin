import type { SearchOptions, TextMatch } from '../viewer/plugins/text/text-engine';
export function searchDocument(text: string, options: SearchOptions, signal: AbortSignal): Promise<{ matches: { start: number; end: number }[]; limited: boolean; count: number }> {
  return new Promise((resolve, reject) => {
    const bytes = new TextEncoder().encode(text);
    const worker = new Worker(new URL('../viewer/plugins/text/text.worker.ts', import.meta.url), { type: 'module' });
    const matches: TextMatch[] = []; let limited = false, count = 0;
    const timeout = setTimeout(() => { finish(); reject(Error('Search exceeded the 5 second safety limit.')); }, 5000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Search cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onerror = () => { finish(); reject(Error('Search worker failed')); };
    worker.onmessage = ({ data }) => {
      if (data.kind === 'read') { const chunk = bytes.slice(data.offset, data.offset + data.length); worker.postMessage({ kind: 'bytes', id: data.id, bytes: chunk }, [chunk.buffer]); }
      if (data.kind === 'progress') { matches.push(...data.value.matches); limited ||= data.value.limited; count = data.value.count; }
      if (data.kind === 'error') { finish(); reject(Error(data.error)); }
      if (data.kind === 'result') {
        finish(); const lines = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1);
        resolve({ matches: matches.map(m => ({ start: (lines[m.line - 1] ?? 0) + m.column, end: (lines[m.line - 1] ?? 0) + m.column + m.length })), limited: limited || count > matches.length, count });
      }
    };
    worker.postMessage({ kind: 'search', size: bytes.length, encoding: 'utf-8', options });
  });
}
