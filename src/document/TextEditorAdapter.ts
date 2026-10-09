import type { DocumentSession } from './session';
export interface TextEditorAdapter {
  getValue(): string;
  setValue(value: string): void;
  getSelection(): { start: number; end: number };
  replaceSelection(value: string): void;
  focus(): void;
  undo(): void;
  redo(): void;
  find(start: number, end: number): void;
  replace(start: number, end: number, value: string): void;
}
export function textareaAdapter(input: HTMLTextAreaElement, session: DocumentSession, update: () => void): TextEditorAdapter {
  const setValue = (value: string) => { const ending = session.lineEndings === 'CRLF' ? '\r\n' : session.lineEndings === 'CR' ? '\r' : '\n'; session.modify(value.replace(/\r\n|\r|\n/g, ending)); update(); };
  return {
    getValue: () => input.value, setValue,
    getSelection: () => ({ start: input.selectionStart, end: input.selectionEnd }),
    replaceSelection(value) { this.replace(input.selectionStart, input.selectionEnd, value); },
    focus: () => input.focus(),
    undo: () => { session.undo(); update(); }, redo: () => { session.redo(); update(); },
    find: (start, end) => { input.focus(); input.setSelectionRange(start, end); },
    replace: (start, end, value) => { setValue(input.value.slice(0, start) + value + input.value.slice(end)); requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + value.length, start + value.length); }); },
  };
}
