import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import * as core from '@tauri-apps/api/core';
import {formatManifest,enhanceDescriptor,formatIndex} from '../src/formats';
import {createBuiltinRegistry} from '../src/viewer/builtins';
import {resolveSample} from '../src/services/detection/browserDetector';
import {parseJsonLines} from '../src/viewer/plugins/json/json-lines';
import {rawNode} from '../src/viewer/plugins/json/json-parser';
import {DocumentSession,documentSessions} from '../src/document/session';
import {saveDocument} from '../src/document/save-service';
import {editableKind} from '../src/document/editing';
import {parseEditableCsv,serializeCsv} from '../src/document/csv';
import {textareaAdapter} from '../src/document/TextEditorAdapter';
vi.mock('@tauri-apps/api/core',{spy:true});
afterEach(()=>{vi.restoreAllMocks();documentSessions.clear();});
describe('155 production editing paths (routing checks, not manufactured content evidence)',()=>{
 const registry=createBuiltinRegistry();
 it.each(formatManifest.map(c=>[c.formatId,c] as const))('%s has consistent editor/writer and a real primary route',async(_id,c)=>{
  const text=['core.text-fallback','json','markdown','csv'].includes(c.viewerId!),sample=new TextEncoder().encode(text?'{}':'binary');
  const file={...resolveSample('sample.'+(c.extensions[0]??'bin'),sample,sample.length),detectedType:c.legacyType,isText:text,isBinary:!text,format:{formatId:c.formatId,status:'Probable' as const,candidates:[c.formatId],conflict:false,evidence:[],probeBytes:0}};
  expect(registry.has(c.viewerId!)).toBe(true);
  if(c.canEdit){expect(editableKind(file)).toBeDefined();expect(c.writerId).toBe('document.atomic-utf8');expect(c.editCapability).toBe('limited');expect(c.saveCapability).toBe('limited-save');}
  else {expect(editableKind(file)).toBeUndefined();expect(c.writerId).toBeNull();expect(c.saveCapability).toBe('no-write');}
  if(c.previewLevel!=='detection-only')expect((await registry.resolve(file,{forceId:c.viewerId}))?.id).toBe(c.viewerId);
 });
});
describe('JSON Lines uses existing content models and source-preserving editing',()=>{
 const source='{"keep":900719925474099312345,"duplicate":1,"duplicate":2}\r\n{"unknown":{"nested":true},"label":"before"}\r\n';
 it('parses multiple records with original offsets, precision, duplicates and pointers',()=>{const m=parseJsonLines(source);expect(m.status).toBe('ready');expect(m.nodes[0].children).toHaveLength(2);expect(rawNode(m,m.pointers.get('/0/keep')!)).toBe('900719925474099312345');expect(rawNode(m,m.pointers.get('/1/unknown/nested')!)).toBe('true');expect(m.stats.duplicateKeys).toBe(1);expect(rawNode(m,m.pointers.get('/1')!)).toContain('unknown');expect(m.source).toBe(source);});
 it('validates every record and reports the correct line without partial false-success',()=>{for(const text of ['{}\n{bad}\n','{}\n\n{}','{}\n[] extra']){const m=parseJsonLines(text);expect(m.status).toBe('invalid');expect(m.nodes).toEqual([]);expect(m.diagnostics[0].line).toBe(2);}const s=new DocumentSession('{}\n{bad}\n','jsonl');expect(s.validationState?.line).toBe(2);});
 it('preserves untouched data, UTF8 BOM, CRLF and source on edit/save serialization',()=>{const s=new DocumentSession(source,'jsonl','/records.jsonl','base',true);expect(s.validationState).toBeNull();const input=document.createElement('textarea');input.value=source;textareaAdapter(input,s,()=>{}).setValue(input.value.replace('before','after'));expect(s.dirty).toBe(true);expect(new TextDecoder('utf8',{ignoreBOM:true}).decode(s.serialize())).toBe('\uFEFF'+source.replace('before','after'));s.saved(s.currentState,'new','/records.jsonl');expect(s.dirty).toBe(false);expect(parseJsonLines(s.currentState).status).toBe('ready');});
 it('selects JSONL/NDJSON mode and newly connected existing JSON aliases',()=>{for(const name of ['events.jsonl','events.ndjson','package.json','sample.ipynb']){const bytes=new TextEncoder().encode(name.endsWith('jsonl')||name.endsWith('ndjson')?source:'{"untouched":{"metadata":42}}');const file=enhanceDescriptor(resolveSample(name,bytes,bytes.length),bytes);expect(editableKind(file)).toBe(name.endsWith('jsonl')||name.endsWith('ndjson')?'jsonl':'json');}expect(formatIndex.get('yaml')?.capabilities.editLimitations?.join(' ')).toContain('not a structural parser');});
 it('does not lose blank CSV rows, ragged fields, formulas, leading zeroes or multiline cells',()=>{for(const [text,tab]of [['a,b\r\n00123,"x\ny"\r\n\r\n=cmd,unknown,extra\r\n',false],['a\tb\n00123\t"x\ny"\n\n=cmd\tunknown\textra\n',true]] as const){const p=parseEditableCsv(text,tab);p.rows[1][0]='00007';const output=serializeCsv(p.rows,p.dialect.delimiter,p.dialect.newline,true);const read=parseEditableCsv(output,tab);expect(read.rows).toEqual(p.rows);expect(read.rows[2]).toEqual(['']);expect(read.rows[3]).toEqual(['=cmd','unknown','extra']);}});
});
describe('existing save boundary',()=>{
 it('read-only in-place writes are rejected before invoking the backend',async()=>{vi.spyOn(core,'isTauri').mockReturnValue(true);const invoke=vi.spyOn(core,'invoke');const s=new DocumentSession('base','text','/readonly','fp');s.readOnly=true;s.modify('edited');await expect(saveDocument(s,'readonly')).rejects.toThrow(/read-only/);expect(invoke).not.toHaveBeenCalled();expect(s.dirty).toBe(true);});
 it('failed and conflicted saves keep original snapshot and local edits; save-as sends no source overwrite authority',async()=>{
  vi.spyOn(core,'isTauri').mockReturnValue(true);const invoke=vi.spyOn(core,'invoke').mockRejectedValue({code:'conflict',message:'external change'});const s=new DocumentSession('{"unknown":42}','json','/sample.json','fp');s.modify('{"unknown":42,"edit":1}');await expect(saveDocument(s,'sample.json')).rejects.toMatchObject({code:'conflict'});expect(s.originalSnapshot).toBe('{"unknown":42}');expect(s.dirty).toBe(true);
  invoke.mockImplementation(async(command)=>command==='document_save'?{path:'/copy.json',fingerprint:'new'}:undefined);await saveDocument(s,'sample.json',true);expect(invoke.mock.calls.find(c=>c[0]==='document_save'&&(c[1] as any).path===null)?.[1]).toMatchObject({path:null,expected:null});expect(s.path).toBe('/copy.json');expect(s.dirty).toBe(false);
 });
 it('the complete matrix carries all editing axes with honest missing evidence',()=>{const m=JSON.parse(readFileSync('docs/formats/format-capability-matrix.json','utf8'));expect(m.formats).toHaveLength(155);for(const r of m.formats){expect(r.editCapability).toBeDefined();expect(r.editEvidence.runtimeStatus).toBeDefined();expect(r.editLimitations.length).toBeGreaterThan(0);}});
});
