import { jsonValidator, jsonLinesValidator, type DocumentDiagnostic } from './validation';
import type { FileSource } from '../services/fileSource';
import type { FileDescriptor } from '../types/files';
export const EDIT_LIMIT = 2 * 1024 * 1024;
export const UNDO_BUDGET = 16 * 1024 * 1024;
export type DocumentKind = 'text' | 'markdown' | 'json' | 'jsonl' | 'csv';
type HistoryEntry = { text: string; columns?: number; header?: boolean; revision: number };
export class DocumentSession {
  readonly id = crypto.randomUUID();
  revision = 0;
  savedRevision = 0;
  saveState = 'Unsaved';
  externalChangeState = 'unchanged';
  recoveryState = 'none';
  readOnly = false;
  source?: FileSource;
  sourceDescriptor?: FileDescriptor;
  get canSaveInPlace() { return !!this.path && !this.readOnly; }
  get canSaveAs() { return true; }
  get readOnlyReason() { return this.path ? undefined : 'This source supports Save As only.'; }
  encoding = 'UTF-8';
  lineEndings: string;
  originalSnapshot: string;
  csvColumns?: number;
  csvHeader?: boolean;
  csvDraft?: { row: number; column: number; value: string };
  commitPendingEdit?: () => void;
  private history: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private composing = false;
  private validatedText?: string;
  private diagnostic: DocumentDiagnostic | null = null;
  private revisionCounter = 0;
  private entry(): HistoryEntry { return {text: this.currentState, columns: this.csvColumns, header: this.csvHeader, revision: this.revision}; }
  private apply(entry: HistoryEntry) { this.currentState = entry.text; this.csvColumns = entry.columns; this.csvHeader = entry.header; this.revision = entry.revision; this.trimHistory(); }
  beginTransaction() { this.composing = true; this.history.push(this.entry()); }
  endTransaction() { this.composing = false; this.trimHistory(); }
  private trimHistory() { while (this.history.length > 100 || this.history.reduce((n, s) => n + s.text.length * 2, 0) > UNDO_BUDGET) this.history.shift(); }
  reset(text: string, fingerprint: string) { this.currentState = this.originalSnapshot = text; this.fingerprint = fingerprint; this.history = []; this.future = []; this.revision = ++this.revisionCounter; this.savedRevision = this.revision; this.externalChangeState = 'unchanged'; }
  constructor(public currentState: string, public kind: DocumentKind, public path: string | null = null, public fingerprint: string | null = null, public bom = false) {
    this.originalSnapshot = currentState;
    const endings = new Set(currentState.match(/\r\n|\r|\n/g));
    this.lineEndings = endings.size > 1 ? 'Mixed' : endings.has('\r\n') ? 'CRLF' : endings.has('\r') ? 'CR' : 'LF';
  }
  get dirty() { return !!this.csvDraft || this.revision !== this.savedRevision || !this.path; }
  get validationState() {
    if (this.kind !== 'json' && this.kind !== 'jsonl') return null;
    if (this.validatedText !== this.currentState) { this.validatedText = this.currentState; this.diagnostic = (this.kind==='jsonl'?jsonLinesValidator:jsonValidator).validate(this.currentState); }
    return this.diagnostic;
  }
  modify(value: string, metadata?: { columns: number; header: boolean }) {
    if (value.length > EDIT_LIMIT || new TextEncoder().encode(value).length + (this.bom ? 3 : 0) > EDIT_LIMIT) throw Error('This document exceeds the safe editing limit.');
    if (value === this.currentState && (!metadata || metadata.columns === this.csvColumns && metadata.header === this.csvHeader)) return;
    if (!this.composing) this.history.push(this.entry());
    this.trimHistory();
    this.future = []; this.currentState = value; if (metadata) { this.csvColumns = metadata.columns; this.csvHeader = metadata.header; } this.revision = ++this.revisionCounter;
  }
  undo() { const value = this.history.pop(); if (value !== undefined) { this.future.push(this.entry()); this.apply(value); } }
  redo() { const value = this.future.pop(); if (value !== undefined) { this.history.push(this.entry()); this.apply(value); } }
  saved(text: string, fingerprint: string, path: string) { this.originalSnapshot = text; this.savedRevision = this.revision; this.fingerprint = fingerprint; this.path = path; this.saveState = 'Saved'; }
  serialize() { const bytes = new TextEncoder().encode(this.currentState); if (!this.bom) return bytes; const output = new Uint8Array(bytes.length + 3); output.set([239,187,191]); output.set(bytes, 3); return output; }
}
export function detectClipboard(text: string): DocumentKind {
  if (text.trim()) { try { JSON.parse(text); return 'json'; } catch { /* lightweight heuristic */ } }
  const lines = text.trim().split(/\r?\n/);
  if (lines.length > 1 && [',','\t',';','|'].some(d => lines.every(l => l.split(d).length === lines[0].split(d).length && l.split(d).length > 1))) return 'csv';
  return /^(#{1,6}\s|[-*]\s|```|>\s)/m.test(text) ? 'markdown' : 'text';
}
export const documentSessions = new Map<object, DocumentSession>();
const identities = new WeakMap<object, string>();
export function documentIdentity(source: object) { let id = identities.get(source); if (!id) { id = crypto.randomUUID(); identities.set(source, id); } return id; }
