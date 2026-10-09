import { t as tr } from "../i18n";
import type { DocumentKind } from './session';
export const documentFormats = [
  { kind: 'text', get label() { return tr("Plain Text"); }, extension: 'txt', category: 'Text', get description() { return tr("A simple text file, ideal for notes, drafts, and general writing."); }, preview: 'Start writing your notes here.' },
  { kind: 'markdown', label: 'Markdown', extension: 'md', category: 'Text', get description() { return tr("Formatted text for notes and documentation, with Markdown preview."); }, preview: '# Title\n\nWrite with **Markdown**.' },
  { kind: 'json', label: 'JSON', extension: 'json', category: 'Data', get description() { return tr("Structured data with JSON validation and formatting."); }, preview: '{\n  "name": "Elorin"\n}' },
  { kind: 'csv', label: 'CSV', extension: 'csv', category: 'Data', get description() { return tr("Comma-separated values, ideal for tabular data and spreadsheets."); }, preview: 'name,age,city\nAlice,26,New York\nBob,34,London' },
] as const;
export interface CreateLocation { id: string; label: string; path?: string; systemLabel?: boolean }
export interface NewDocumentRequest { kind: DocumentKind; name: string; location: string; content?: string }
export function documentFileName(name: string, kind: DocumentKind) {
  const extension = kind==='jsonl'?'jsonl':documentFormats.find(f => f.kind === kind)!.extension;
  const trimmed = name.trim();
  return trimmed.toLowerCase().endsWith(`.${extension}`) ? trimmed : `${trimmed}.${extension}`;
}
export function validateDocumentName(name: string): string | undefined {
  if (!name.trim()) return 'Enter a file name.';
  if (name.length > 180) return 'Use a file name of 180 characters or fewer.';
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..') return 'Use a file name without reserved characters or a trailing dot or space.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name.trim())) return 'This file name is reserved by Windows.';
}
