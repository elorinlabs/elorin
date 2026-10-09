import { t as tr, useUiLanguage as useLocale, localizedError as uiError } from "../i18n";
import { useEffect, useState } from 'react';
import type { TextEditorAdapter } from './TextEditorAdapter';
import { searchDocument } from './search';
import { confirmDocument } from './dialog';
export function EditorSearch({ adapter, revision, close, replaceMode }: { adapter: () => TextEditorAdapter | undefined; revision: number; close: () => void; replaceMode: boolean }) {
  useLocale();
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [caseSensitive, setCase] = useState(false), [wholeWord, setWord] = useState(false), [regex, setRegex] = useState(false);
  const [selectionScope, setScope] = useState(false);
  const [matches, setMatches] = useState<{ start: number; end: number }[]>([]), [index, setIndex] = useState(-1), [message, setMessage] = useState(''), [limited,setLimited] = useState(false);
  const [range] = useState(() => adapter()?.getSelection() ?? { start: 0, end: 0 });
  useEffect(() => {
    const controller = new AbortController(); const text = adapter()?.getValue() ?? '';
    const start = selectionScope ? range.start : 0, end = selectionScope ? range.end : text.length;
    const timer = setTimeout(() => {
      void searchDocument(text.slice(start, end), { query, caseSensitive, wholeWord, regex }, controller.signal).then(result => { setLimited(result.limited); setMatches(result.matches.map(m => ({ start: m.start + start, end: m.end + start }))); setIndex(-1); setMessage(result.limited ? tr("{v0} matches; results limited. Replace All disabled.", { v0: result.count }) : tr("{v0} matches", { v0: result.count })); }, error => { if (!controller.signal.aborted) { setLimited(false); setMatches([]); setMessage(uiError(error)); } });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, caseSensitive, wholeWord, regex, selectionScope, revision]);
  function navigate(delta: number) { if (!matches.length) return; const next = (index + delta + matches.length) % matches.length; setIndex(next); adapter()?.find(matches[next].start, matches[next].end); }
  async function replace(all: boolean) {
    const editor = adapter(); if (!editor || !matches.length || (all && limited)) return;
    if (all && matches.length > 100000 && !await confirmDocument(tr("Replace {v0} occurrences?", { v0: matches.length }))) return;
    const targets = all ? matches : [matches[Math.max(0,index)]], text = editor.getValue();
    const expression = regex ? new RegExp(query, caseSensitive ? 'u' : 'iu') : undefined;
    let value = text;
    for (const target of [...targets].reverse()) { const raw = text.slice(target.start, target.end); const next = expression ? raw.replace(expression, replacement) : replacement; value = value.slice(0, target.start) + next + value.slice(target.end); }
    try { editor.setValue(value); } catch (error) { setMessage(uiError(error)); }
  }
  return <div className="document-toolbar" role="search"><input autoFocus aria-label={tr("Find in document")} value={query} onChange={e => setQuery(e.target.value)} /><label><input type="checkbox" checked={caseSensitive} onChange={e => setCase(e.target.checked)} />{tr("Case")}</label><label><input type="checkbox" checked={wholeWord} onChange={e => setWord(e.target.checked)} />{tr("Whole word")}</label><label><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} />{tr("Regex")}</label><button onClick={() => navigate(-1)}>{tr("Previous")}</button><button onClick={() => navigate(1)}>{tr("Next")}</button>{replaceMode && <><input aria-label={tr("Replacement")} value={replacement} onChange={e => setReplacement(e.target.value)} /><label><input type="checkbox" checked={selectionScope} onChange={e => setScope(e.target.checked)} />{tr("Selection")}</label><button onClick={() => replace(false)}>{tr("Replace")}</button><button disabled={limited} onClick={() => replace(true)}>{tr("Replace All")}</button></>}<span role="status">{tr(message)}</span><button onClick={close}>{tr("Close search")}</button></div>;
}
