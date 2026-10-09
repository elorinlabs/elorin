import type { SyntaxToken } from './syntax-highlighter';
export const SOURCE_BUDGET = { bytes: 512 * 1024, lines: 20000, longest: 16384, nodes: 1000, depth: 64, timeout: 4000 } as const;
export interface SourceSymbol { name: string; kind: string; line: number; column: number; endLine: number; endColumn: number }
export interface ConfigNode { name: string; kind: string; line: number; column: number; children?: ConfigNode[] }
export interface SourceAnalysis { tokens: SyntaxToken[][]; symbols: SourceSymbol[]; config?: ConfigNode; diagnostic?: string; parser?: string }
/** Parser-backed JS/TS/JSX/TSX declarations only; no speculative regex outline. */
export async function analyzeSource(text: string, language: string, filename: string): Promise<SourceAnalysis> {
  if (text.length > SOURCE_BUDGET.bytes || text.split(/\r\n|\r|\n/).some(l => l.length > SOURCE_BUDGET.longest) || (text.match(/\r\n|\r|\n/g)?.length ?? 0) >= SOURCE_BUDGET.lines)
    throw Error('Document analysis budget exceeded; plain source remains available.');
  const result: SourceAnalysis = {tokens:[], symbols:[]};
  const {highlightDocument} = await import('./syntax-highlighter');
  result.tokens = await highlightDocument(text, language);
  if (['javascript','typescript','jsx','tsx'].includes(language) && !/\.json5$/i.test(filename)) {
    const ts = await import('typescript');
    const kind = /\.tsx$/i.test(filename) || language === 'tsx' ? ts.ScriptKind.TSX : /\.jsx$/i.test(filename) || language === 'jsx' ? ts.ScriptKind.JSX : language === 'typescript' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const file = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind);
    const errors = (file as typeof file & {parseDiagnostics: readonly import('typescript').DiagnosticWithLocation[]}).parseDiagnostics;
    result.parser = 'TypeScript syntax parser';
    if (errors.length) { const d=errors[0], p=file.getLineAndCharacterOfPosition(d.start ?? 0); result.diagnostic = `Syntax error at ${p.line+1}:${p.character+1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`; return result; }
    let visited=0;
    const visit = (node: import('typescript').Node, depth: number) => {
      if (++visited > 50000 || depth > SOURCE_BUDGET.depth) throw Error('Symbol traversal budget reached');
      let name: string | undefined, kind: string | undefined;
      if (ts.isClassDeclaration(node)) {name=node.name?.text;kind='Class';}
      else if(ts.isFunctionDeclaration(node)){name=node.name?.text;kind='Function';}
      else if(ts.isMethodDeclaration(node)){name=node.name.getText(file);kind='Method';}
      else if(ts.isInterfaceDeclaration(node)){name=node.name.text;kind='Interface';}
      else if(ts.isEnumDeclaration(node)){name=node.name.text;kind='Enum';}
      else if(ts.isModuleDeclaration(node)){name=node.name.text;kind='Namespace / Module';}
      else if(ts.isVariableDeclaration(node) && node.parent.parent.parent === file){name=node.name.getText(file);kind='Top-level declaration';}
      if(name && kind){if(result.symbols.length >= SOURCE_BUDGET.nodes) throw Error('Symbol count budget reached'); const start=file.getLineAndCharacterOfPosition(node.getStart(file)), end=file.getLineAndCharacterOfPosition(node.end);result.symbols.push({name:name.slice(0,256),kind,line:start.line+1,column:start.character+1,endLine:end.line+1,endColumn:end.character+1});}
      ts.forEachChild(node, child=>visit(child, depth+1));
    };
    try {visit(file,0);} catch(e){result.symbols=[]; result.diagnostic=(e as Error).message;}
  }
  if (['json','jsonc'].includes(language)) {
    const {parseTree, printParseErrorCode} = await import('jsonc-parser');
    const errors: import('jsonc-parser').ParseError[]=[];
    const root=parseTree(text, errors,{allowTrailingComma:language==='jsonc',disallowComments:language==='json'});
    const starts=[0];for(const m of text.matchAll(/\r\n|\r|\n/g))starts.push(m.index!+m[0].length);
    const location=(offset:number)=>{let lo=0,hi=starts.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(starts[mid]<=offset)lo=mid;else hi=mid-1;}return {line:lo+1,column:offset-starts[lo]+1};};
    result.parser='jsonc-parser (source order; duplicate keys retained)';
    if(errors.length){const e=errors[0],p=location(e.offset);result.diagnostic=`${printParseErrorCode(e.error)} at ${p.line}:${p.column}`;}
    else if(root){let count=0;const node=(n:import('jsonc-parser').Node,name:string,depth:number):ConfigNode=>{if(++count>SOURCE_BUDGET.nodes || depth>SOURCE_BUDGET.depth)throw Error('Configuration tree budget reached');const value=n.type==='property'?n.children![1]:n;return {name:name.slice(0,256),kind:value.type,...location(n.offset),children:value.children?.map((child,i)=>node(child,child.type==='property'?String(child.children![0].value):String(i),depth+1))};};try{result.config=node(root,'Root',0);}catch(e){result.diagnostic=(e as Error).message;}}
  }
  return result;
}

