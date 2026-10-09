import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {analyzeSource,SOURCE_BUDGET} from '../src/viewer/plugins/text/source-analysis';
import {sourcePosition} from '../src/viewer/plugins/text/source-position';
import {highlightDocument} from '../src/viewer/plugins/text/syntax-highlighter';
import {detectTextProfile} from '../src/viewer/plugins/text/text-profile';
import {formatIndex, enhanceDescriptor} from '../src/formats';
import {descriptor,source} from './viewer-helpers';
import {loadText} from '../src/viewer/plugins/text/text-model';
import {TextViewer} from '../src/viewer/plugins/text/TextViewer';
import {indexText,readTextLines} from '../src/viewer/plugins/text/text-engine';
describe('Module 19 source correctness',()=>{
 it('separates byte, code point, UTF-16 and tab visual columns including BOM',()=>{
  expect(sourcePosition('中🌈\tx',4,3,'utf-8',4)).toEqual({utf16:5,codePoint:4,visual:5,byte:'11'});
  expect(sourcePosition('中🌈\tx',4,2,'utf-16be',8)).toEqual({utf16:5,codePoint:4,visual:9,byte:'10'});
  expect(sourcePosition('🌈',1,0,'utf-8',4).byte).toBe('0');
  expect(sourcePosition('�',1,0,'utf-8',4,true).byte).toBeUndefined();
 });
 it.each(['Dockerfile','Makefile','CMakeLists.txt','package.json','tsconfig.json','.env','.gitignore','.editorconfig','Cargo.toml','pyproject.toml','go.mod','build.gradle','a.d.ts','a.vue','a.svelte','a.astro','a.jsonc'])('reuses catalogue for %s',name=>{const file=enhanceDescriptor(descriptor(name));expect(file.format?.formatId).not.toBe('unknown');expect(detectTextProfile(file,'').language).toBeTruthy();});
 it('retains ambiguous language choices and bounded shebang fallback',()=>{expect(formatIndex.match('a.pl')).toEqual(['perl-source','prolog-source']);expect(enhanceDescriptor(descriptor('a.m')).format?.status).toBe('Ambiguous');expect(detectTextProfile(descriptor('no-extension'),'#!/usr/bin/env python3\n').language).toBe('python');expect(detectTextProfile(descriptor('unknown.custom'),'hello')).toEqual({profile:'Plain'});});
 it('preserves multiline state and source text with inert tokens across virtual boundaries',async()=>{
  const text='/* start\n'+ 'comment\n'.repeat(60)+'end */\nconst x = `<script>${1}</script>`;';const lines=await highlightDocument(text,'javascript');
  expect(lines[40][0].className).toContain('hljs-comment');expect(lines.map(l=>l.map(t=>t.text).join('')).join('\n')).toBe(text);
  expect((await highlightDocument('const a = "& < > \'";','javascript'))[0].map(t=>t.text).join('')).toBe('const a = "& < > \'";');
 });
 it('extracts parser-backed nested declarations and rejects invalid syntax',async()=>{
  const a=await analyzeSource('const x=1;\nexport class A { run() { return 1; } }\ninterface B {}\nfunction f() {}\nenum E { X }\nnamespace N {}','typescript','a.ts');
  expect(a.symbols.map(s=>s.kind)).toEqual(['Top-level declaration','Class','Method','Interface','Function','Enum','Namespace / Module']);expect(a.symbols[1]).toMatchObject({name:'A',line:2,column:1,endLine:2});
  expect((await analyzeSource('function broken( {','typescript','a.ts')).symbols).toEqual([]);
  expect((await analyzeSource('const A = () => <div>{`hello ${1}`}</div>;','tsx','a.tsx')).diagnostic).toBeUndefined();
 });
 it('configuration parsing preserves comments policy, duplicates, order and errors',async()=>{
  const text='// comment\n{"z":1,"a":2,"a":3,}';const a=await analyzeSource(text,'jsonc','tsconfig.json');expect(a.config?.children?.map(n=>n.name)).toEqual(['z','a','a']);expect(a.config?.children?.[0].line).toBe(2);
  const strict=await analyzeSource(text,'json','a.json');expect(strict.config).toBeUndefined();expect(strict.diagnostic).toMatch(/at 1:1/);
  const deep=await analyzeSource('['.repeat(70)+'0'+']'.repeat(70),'json','a.json');expect(deep.config).toBeUndefined();expect(deep.diagnostic).toMatch(/budget/);
  const json5=await analyzeSource('{ key: Infinity, trailing: 1, }','javascript','a.json5');expect(json5.parser).toBeUndefined();expect(json5.diagnostic).toBeUndefined();expect(json5.config).toBeUndefined();
  for(const language of ['yaml','ini']){const plain=await analyzeSource('a: &a [*a]\n!!python/object:foo {}',language,'a');expect(plain.config).toBeUndefined();expect(plain.parser).toBeUndefined();}
 });
 it('rejects long single lines and oversized analysis instead of losing grammar state',async()=>{await expect(analyzeSource('x'.repeat(SOURCE_BUDGET.longest+1),'typescript','a.ts')).rejects.toThrow(/budget/);await expect(analyzeSource('x'.repeat(SOURCE_BUDGET.bytes+1),'typescript','a.ts')).rejects.toThrow(/budget/);});
 it.each(['utf-8','utf-16le','utf-16be'])('preserves original newline and byte coordinates in %s',async encoding=>{
  const text='中🌈\tx\r\nnext\rlast\n';let bytes:Uint8Array;
  if(encoding==='utf-8')bytes=new Uint8Array([239,187,191,...new TextEncoder().encode(text)]);else {bytes=new Uint8Array(2+text.length*2);bytes.set(encoding==='utf-16le'?[255,254]:[254,255]);for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);bytes.set(encoding==='utf-16le'?[n&255,n>>8]:[n>>8,n&255],2+i*2);}}
  const read=async(at:number,n:number)=>bytes.slice(at,at+n);const lines=await readTextLines(read,bytes.length,encoding,0,1,1,10);expect(lines.map(l=>l.text)).toEqual(['中🌈\tx','next','last','']);expect(lines[0].offset).toBe(encoding==='utf-8'?3:2);let stats:any;await indexText(read,bytes.length,encoding,s=>stats=s);expect(stats.endings).toEqual({LF:1,CRLF:1,CR:1});
 });
 it('suspends worker tasks, clears tokens, rejects stale results and releases model',async()=>{
  const m=await loadText({file:descriptor('a.ts'),source:source('const a=1'),signal:new AbortController().signal,services:{file:{}},onCleanup(){}});
  const workers:any[]=[];class FakeWorker{onmessage:any;onerror:any;terminate=vi.fn();postMessage(){}constructor(){workers.push(this);}}
  vi.stubGlobal('Worker',FakeWorker);try{
   const pending=m.analyze();await waitFor(()=>expect(workers.length).toBe(1));m.setActive(false);await pending;expect(workers[0].terminate).toHaveBeenCalledOnce();workers[0].onmessage({data:{value:{tokens:[],symbols:[]}}});expect(m.analysis).toBeUndefined();
   m.setActive(true);await waitFor(()=>expect(workers.length).toBeGreaterThan(1));m.dispose();expect(workers.every(w=>w.terminate.mock.calls.length===1)).toBe(true);expect(m.checkpoints).toEqual([]);
  }finally{m.dispose();vi.unstubAllGlobals();}
 });
 it('shows source settings and bounded structure panel, no execution elements',async()=>{
  const m=await loadText({file:descriptor('a.ts'),source:source('/* c */\nconst x=1;'),signal:new AbortController().signal,services:{file:{}},onCleanup(){}});const view=render(<TextViewer model={m} context={m.context} session={{metadata:{}}} updateSession={()=>{}}/>);expect(screen.getByLabelText('Source language')).toHaveValue('typescript');expect(view.container.querySelector('.source-structure')).not.toHaveAttribute('open');fireEvent.change(screen.getByLabelText('Source language'),{target:{value:'python'}});expect(m.language).toBe('python');expect(view.container.querySelectorAll('iframe,script,img')).toHaveLength(0);view.unmount();m.dispose();
 });
 it('copies raw selected ranges before the platform clipboard transforms newline conventions',async()=>{
  const text='中🌈\tfirst\r\nsecond\nthird';const m=await loadText({file:descriptor('a.ts'),source:source(text),signal:new AbortController().signal,services:{file:{}},onCleanup(){}});const rows=await m.lines(1,3,new AbortController().signal);const copy=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});await m.copyLines(rows[0],rows[1]);expect(copy).toHaveBeenCalledWith('中🌈\tfirst\r\nsecond');m.dispose();
 });
 it('bounds the visible request even if an ancestor reports a giant viewport',async()=>{
  const text='x\n'.repeat(100000);const m=await loadText({file:descriptor('a.ts'),source:source(text),signal:new AbortController().signal,services:{file:{}},onCleanup(){}});await waitFor(()=>expect(m.status).toBe('complete'));const spy=vi.spyOn(m,'lines');class GiantObserver{constructor(callback:any){callback([{contentRect:{height:1_000_000,width:900}}]);}observe(){}disconnect(){}}vi.stubGlobal('ResizeObserver',GiantObserver);try{const view=render(<TextViewer model={m} context={m.context} session={{metadata:{}}} updateSession={()=>{}}/>);await waitFor(()=>expect(spy).toHaveBeenCalled());expect(spy.mock.calls.every(call=>call[1]<=96)).toBe(true);expect(view.container.querySelectorAll('.text-row').length).toBeLessThanOrEqual(96);view.unmount();}finally{m.dispose();vi.unstubAllGlobals();}
 });
});


