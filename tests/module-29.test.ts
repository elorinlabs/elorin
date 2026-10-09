import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {FormatIndex,formatManifest,enhanceDescriptor,formatIndex} from '../src/formats';
import {loadContentAdapter,parseFormat} from '../src/formats/content-adapter';
import {resolveSample} from '../src/services/detection/browserDetector';
import type {FileSource} from '../src/services/fileSource';
import {ViewerController} from '../src/viewer/core/controller';
import {ViewerRegistry} from '../src/viewer/core/registry';
import type {ViewerState} from '../src/viewer/core/types';
import {input,testPlugin} from './viewer-helpers';
const {check}=createRequire(import.meta.url)('../scripts/check-format-registration.cjs');
const catalogue=()=>JSON.parse(readFileSync('src/formats/catalogue.json','utf8'));
const bindings=()=>JSON.parse(readFileSync('src/formats/content-adapters.json','utf8'));
const matrix=()=>JSON.parse(readFileSync('docs/formats/format-capability-matrix.json','utf8'));
const data=(name:string)=>new Uint8Array(readFileSync('tests/fixtures/module28/'+name));
describe('Module 29 production format registration',()=>{
 it('checks all production rows, runtime routes, worker dispatch and sample hashes',()=>{expect(check()).toMatchObject({status:'PASS',formatCount:155,adapterCount:3,errors:[]});});
 it('rejects duplicate IDs and extension conflicts without arbitration',()=>{
  const c=catalogue();c.push(c[0]);expect(check({catalogue:c}).errors.join('\n')).toContain('duplicate format ID');
  const d=catalogue();d[1].extensions.push(d[0].extensions[0]);expect(check({catalogue:d}).errors.join('\n')).toContain('without explicit ambiguity policy');
 });
 it('rejects nonexistent parsers/Viewers and model mismatches',()=>{
  const c=catalogue();c.find((r:any)=>r.formatId==='psd').parserId='absent';expect(check({catalogue:c}).errors.join('\n')).toContain('missing parser absent');
  const b=bindings();b[0].viewer='absent';expect(check({bindings:b}).errors.join('\n')).toContain('missing Viewer absent');
  b[0].viewer='image';b[0].outputModel='GeometryDocumentModel';expect(check({bindings:b}).errors.join('\n')).toContain('incompatible');
 });
 it('rejects fake support, stale evidence and missing parser dispatch',()=>{
  const c=catalogue(),psb=c.find((r:any)=>r.formatId==='psb');psb.supportStatus='adapter-implemented';expect(check({catalogue:c}).errors.join('\n')).toContain('no actual parser');
  const m=matrix(),row=m.formats.find((r:any)=>r.formatId==='psd');row.test_evidence=[];expect(check({matrix:m}).errors.join('\n')).toContain('without content parser and sample evidence');
  const n=matrix();n.formats.find((r:any)=>r.formatId==='psd').test_evidence[0].fixture_sha256='fake';expect(check({matrix:n}).errors.join('\n')).toContain('invalid or stale');
  const b=bindings();b[0].worker='src/viewer/plugins/image/image-model.ts';expect(check({bindings:b}).errors.join('\n')).toContain('no actual worker dispatch');
 });
 it('keeps duplicate candidates independent of registration order and uses content probes',()=>{
  const a=new FormatIndex(formatManifest),b=new FormatIndex([...formatManifest].reverse());
  for(const [text,expected]of [['my $value = 42;','perl-source'],[':- module(example, []).','prolog-source'],['unresolved','perl-source']] as const){
   const sample=new TextEncoder().encode(text),file=resolveSample('sample.pl',sample,sample.length),left=a.detect({file,sample}),right=b.detect({file,sample});
   expect(left).toEqual(right);expect(left.formatId).toBe(expected);expect(left.candidates).toHaveLength(2);expect(left.status).toBe(text==='unresolved'?'Ambiguous':'Probable');
  }
 });
 it('unimplemented primary is unsupported, while explicit raw-byte view remains available',async()=>{
  const sample=new Uint8Array([56,66,80,83,0,2]),file=enhanceDescriptor(resolveSample('sample.psb',sample,sample.length),sample),adapter=formatIndex.get('psb')!;
  const options={file,signal:new AbortController().signal,onCleanup:()=>{}};
  await expect(adapter.open({} as FileSource,options)).rejects.toMatchObject({code:'UNSUPPORTED_CONTENT'});
  expect((await adapter.open({} as FileSource,{...options,viewId:'hex'})).view.viewerId).toBe('hex');
  expect(adapter.capabilities.parserId).toBeNull();
  for(const id of ['doc','xls','xlsb','ppt','msg'])expect(formatIndex.get(id)?.capabilities).toMatchObject({parserId:null,supportStatus:'unimplemented',previewLevel:'detection-only'});
 });
 it('loads and parses actual Module 28 samples into existing models',async()=>{
  const image=await parseFormat('psd',data('quadrants.psd').buffer);expect([image.w,image.h]).toEqual([64,64]);expect([...image.rgba.slice(0,4)]).toEqual([255,0,0,255]);
  const mat=data('signals.mat'),reader=await parseFormat('mat',{size:mat.length,read:async(at,n)=>mat.slice(at,at+n)});expect((await reader.page({node:'matrix:0',start:0,count:1,columns:[0]})).values[0][0].display).toBe('1.25');
  const model=await parseFormat('3ds',data('tetrahedron.3ds').buffer);expect(model.metadata.triangles).toBe(4);
 });
 it('preserves parser failures and rejects cancelled/unknown loading',async()=>{
  await expect(parseFormat('psd',data('damaged.psd').buffer)).rejects.toThrow(/truncated/);
  await expect(parseFormat('3ds',data('external-texture.3ds').buffer)).rejects.toThrow(/external textures/);
  const abort=new AbortController();abort.abort();await expect(loadContentAdapter('mat',abort.signal)).rejects.toMatchObject({code:'ABORTED'});
  const closing=new AbortController(),pending=parseFormat('psd',data('quadrants.psd').buffer,closing.signal);closing.abort();await expect(pending).rejects.toMatchObject({code:'ABORTED'});
  await expect(loadContentAdapter('absent' as 'mat')).rejects.toMatchObject({code:'UNSUPPORTED_CONTENT'});
 });
 it('explicit source-text selection bypasses unsupported primary without masking default errors',async()=>{
  const bytes=new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10\nshowpage\n');
  const value=input('source.eps');value.file=enhanceDescriptor(resolveSample('source.eps',bytes,bytes.length),bytes);
  const registry=new ViewerRegistry(formatIndex),states:ViewerState[]=[];registry.register(testPlugin('core.text-fallback',{supportedTypes:[],fallback:'text'}));
  const controller=new ViewerController(registry,s=>states.push(s));controller.start(value);
  await new Promise(r=>setTimeout(r,0));expect(states.at(-1)).toMatchObject({status:'error',error:{code:'UNSUPPORTED_CONTENT'}});
  controller.start(value,'core.text-fallback');await new Promise(r=>setTimeout(r,0));expect(states.at(-1)).toMatchObject({status:'ready',model:'source.eps'});controller.stop();
 });
});
