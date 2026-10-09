/** Document-local paths only; decoding happens once before traversal checks. */
export function safeResourcePath(raw: string) {
  let value: string;
  try { value = decodeURIComponent(raw); } catch { throw Error('Invalid resource path encoding'); }
  if (!value || value.length > 4096 || /[\\:\u0000-\u001f]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..'))
    throw Error('Blocked resource outside the document scope');
  return value;
}
