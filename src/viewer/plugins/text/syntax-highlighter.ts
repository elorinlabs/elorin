import hljs from 'highlight.js/lib/core';
const loaders: Record<string, () => Promise<{default: import('highlight.js').LanguageFn}>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  objectivec: () => import('highlight.js/lib/languages/objectivec'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  perl: () => import('highlight.js/lib/languages/perl'),
  prolog: () => import('highlight.js/lib/languages/prolog'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  swift: () => import('highlight.js/lib/languages/swift'),
  css: () => import('highlight.js/lib/languages/css'),
  scss: () => import('highlight.js/lib/languages/scss'),
  less: () => import('highlight.js/lib/languages/less'),
  xml: () => import('highlight.js/lib/languages/xml'),
  bash: () => import('highlight.js/lib/languages/bash'),
  shell: () => import('highlight.js/lib/languages/shell'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  dos: () => import('highlight.js/lib/languages/dos'),
  lua: () => import('highlight.js/lib/languages/lua'),
  r: () => import('highlight.js/lib/languages/r'),
  dart: () => import('highlight.js/lib/languages/dart'),
  scala: () => import('highlight.js/lib/languages/scala'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  cmake: () => import('highlight.js/lib/languages/cmake'),
  properties: () => import('highlight.js/lib/languages/properties'),
  ini: () => import('highlight.js/lib/languages/ini'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  json: () => import('highlight.js/lib/languages/json'),
  groovy: () => import('highlight.js/lib/languages/groovy'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
};
const pending = new Map<string, Promise<void>>();
async function loadGrammar(language: string) {
  if (hljs.getLanguage(language) || !loaders[language]) return;
  let operation = pending.get(language);
  if (!operation) {
    operation = loaders[language]().then(({default: definition})=> { hljs.registerLanguage(language, definition); });
    pending.set(language, operation);
  }
  await operation;
  // Only explicitly needed embedded grammars; the worker is destroyed after each document.
  if (language === 'xml') await Promise.all([loadGrammar('javascript'),loadGrammar('css')]);
  if (language === 'typescript' || language === 'javascript') { await loadGrammar('css'); if (!hljs.getLanguage('xml')) { const {default: xml}=await loaders.xml(); hljs.registerLanguage('xml',xml); } }
}
export interface SyntaxToken {
  text?: string;
  className?: string;
  children?: SyntaxToken[];
}
/** Highlight one bounded document from its real start, retaining multiline grammar state. */
export async function highlightDocument(text: string, language: string): Promise<SyntaxToken[][]> {
  language = ({jsonc:'json',jsx:'javascript',tsx:'typescript'} as Record<string,string>)[language] ?? language;
  await loadGrammar(language);
  if (!hljs.getLanguage(language)) return [];
  const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  const lines: SyntaxToken[][] = [[]];
  const stack: string[] = [];
  let tokens = 0;
  for (const match of html.matchAll(/<span class="([\w -]+)">|<\/span>|([^<]+)/g)) {
    if (match[1]) stack.push(match[1]);
    else if (match[0] === '</span>') stack.pop();
    else {
      const decoded = match[2].replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e: string) => ({amp:'&',lt:'<',gt:'>',quot:'"','#x27':"'",'#39':"'"})[e]!);
      const pieces = decoded.split(/\r\n|\r|\n/);
      pieces.forEach((piece, i) => {
        if (i) lines.push([]);
        if (piece) { if (++tokens > 50000) throw Error('Syntax token budget reached'); lines.at(-1)!.push({text:piece,className:stack.join(' ')}); }
      });
    }
  }
  return lines;
}

