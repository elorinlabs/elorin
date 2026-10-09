import catalogue from './runtime.json';
import type { FileDescriptor } from '../types/files';
import type { FormatAdapter, FormatCapabilities, FormatDetection, DetectionContext, AdaptedDocument, OpenOptions } from './types';
import type { FileSource } from '../services/fileSource';
import { checkAbort, ViewerError } from '../viewer/core/errors';
export const formatManifest = catalogue.entries.map(([formatId,name,extensions,filenames,legacyType,profile,detectionRules,ambiguityGroup])=>({
  ...catalogue.profiles[profile as number],formatId,name,extensions,filenames,legacyType,detectionRules:detectionRules??undefined,ambiguityGroup:ambiguityGroup??undefined,
})) as FormatCapabilities[];
/** Detection metadata index only. ViewerRegistry remains the sole parser/viewer registry. */
export class FormatIndex {
  private adapters = new Map<string, FormatAdapter>();
  private names = new Map<string, string[]>();
  private suffixes = new Map<string, string[]>();
  private magic = new Map<number,Map<number,{id:string;bytes:number[]}[]>>();
  private mimes = new Map<string,string[]>();
  constructor(entries: readonly FormatCapabilities[] = []) { entries.forEach(entry => this.register(new RoutedFormatAdapter(entry))); }
  register(adapter: FormatAdapter) {
    const c=adapter.capabilities;
    if(!/^[a-z0-9][a-z0-9.-]*$/.test(c.formatId)||this.adapters.has(c.formatId))throw Error(`Duplicate or invalid format ID: ${c.formatId}`);
    if(this.adapters.size>=16384)throw Error('Format definition budget reached');
    if(!c.supportedViews.length||c.extensions.length>256||c.filenames.length>256||c.extensions.some(e=>!e||e.length>128||/[\\/\s]/.test(e)))throw Error('Invalid static format rules');
    if((c.detectionRules?.contentMarkers?.length??0)>32||c.detectionRules?.contentMarkers?.some(m=>!m||m.length>256)||(c.detectionRules?.magic?.length??0)>64||(c.detectionRules?.mimeTypes?.length??0)>32)throw Error('Detection rule budget reached');
    const offsets=new Set(this.magic.keys());
    for(const rule of c.detectionRules?.magic??[]){
      if(!Number.isInteger(rule.offset)||rule.offset<0||rule.offset+rule.bytes.length>65536||!rule.bytes.length||rule.bytes.length>256||rule.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Magic rule exceeds probe budget');
      offsets.add(rule.offset);
      for(const previous of this.magic.get(rule.offset)?.get(rule.bytes[0])??[])if(previous.bytes.length===rule.bytes.length&&previous.bytes.every((b,i)=>b===rule.bytes[i])){
        if(!c.ambiguityGroup||this.adapters.get(previous.id)?.capabilities.ambiguityGroup!==c.ambiguityGroup)throw Error('Conflicting magic signature requires an explicit ambiguity group');
      }
    }
    if(offsets.size>64)throw Error('Magic offset budget reached');
    for(const [index,keys] of [[this.names,c.filenames],[this.suffixes,c.extensions]] as const)for(const key of keys){
      if(!key||key.length>512)throw Error('Invalid filename rule');
      for(const id of index.get(key.toLowerCase())??[]){const other=this.adapters.get(id)!.capabilities;if(!c.ambiguityGroup||other.ambiguityGroup!==c.ambiguityGroup)throw Error(`Conflicting format rule requires an explicit ambiguity group: ${key}`);}
    }
    for(const value of c.filenames)this.add(this.names,value,c.formatId);
    for(const value of c.extensions)this.add(this.suffixes,value,c.formatId);
    for(const rule of c.detectionRules?.magic??[]){
      if(!Number.isInteger(rule.offset)||rule.offset<0||rule.offset+rule.bytes.length>65536||!rule.bytes.length||rule.bytes.length>256||rule.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Magic rule exceeds probe budget');
      if(!this.magic.has(rule.offset)){if(this.magic.size>=64)throw Error('Magic offset budget reached');this.magic.set(rule.offset,new Map());}
      const at=this.magic.get(rule.offset)!;at.set(rule.bytes[0],[...(at.get(rule.bytes[0])??[]),{id:c.formatId,bytes:rule.bytes}]);
    }
    for(const mime of c.detectionRules?.mimeTypes??[])this.add(this.mimes,mime,c.formatId);
    this.adapters.set(c.formatId,adapter);
  }
  private add(index: Map<string,string[]>, key:string,id:string){key=key.toLowerCase();index.set(key,[...(index.get(key)??[]),id]);}
  get(id:string){return this.adapters.get(id);}
  unregister(id:string){const adapter=this.adapters.get(id);if(!adapter)return false;for(const index of [this.names,this.suffixes,this.mimes])for(const [key,ids]of index){const next=ids.filter(value=>value!==id);if(next.length)index.set(key,next);else index.delete(key);}for(const [offset,buckets]of this.magic){for(const [byte,rules]of buckets){const next=rules.filter(r=>r.id!==id);if(next.length)buckets.set(byte,next);else buckets.delete(byte);}if(!buckets.size)this.magic.delete(offset);}return this.adapters.delete(id);}
  list(){return [...this.adapters.values()].map(a=>a.capabilities);}
  match(name:string): string[] {
    const base=name.replaceAll('\\','/').split('/').pop()!.toLowerCase();
    if(base.length>512)return [];
    const exact=this.names.get(base);if(exact)return [...exact].sort();
    const pieces=base.split('.');
    for(let i=1;i<pieces.length;i++){const ids=this.suffixes.get(pieces.slice(i).join('.'));if(ids)return [...ids].sort();}
    return [];
  }
  detect(context:DetectionContext): FormatDetection {
    checkAbort(context.signal);
    const {file,sample}=context, named=this.match(file.name);
    const magicIds:string[]=[];
    if(sample)for(const [offset,buckets]of this.magic)for(const rule of buckets.get(sample[offset])??[])if(offset+rule.bytes.length<=sample.length&&rule.bytes.every((b,i)=>sample[offset+i]===b))magicIds.push(rule.id);
    const specific=named.map(id=>this.get(id)!.capabilities);
    const magic=file.detectionSource.includes('magic');
    const structuredContent=file.detectionSource.includes('content')&&['json','svg','xml','gltf','eml'].includes(file.detectedType);
    const conflict=!!specific.length&&(magic||structuredContent)&&specific.every(c=>c.legacyType!==file.detectedType);
    let ids=conflict?[]:named;
    if(magicIds.length&&!magic&&!structuredContent)ids=[...new Set(magicIds)].sort();
    if(!ids.length&&!magic&&!structuredContent){const mime=file.mimeType?.split(';')[0].trim().toLowerCase();if(mime)ids=this.mimes.get(mime)??[];}
    if(!ids.length)ids=this.get(file.detectedType)?[file.detectedType]:['unknown'];
    const evidence:FormatDetection['evidence']=file.detectionSource.map(kind=>({kind,detail:`Existing bounded detector: ${file.detectedType}`}));
    if(named.length)evidence.push({kind:'filename',detail:`Longest matching name rule: ${file.name}`});
    if(magicIds.includes(ids[0]))evidence.push({kind:'magic',detail:'Adapter-declared bounded magic signature'});
    let status:FormatDetection['status']=ids[0]==='unknown'?'Unknown':ids.length>1?'Ambiguous':magic||magicIds.includes(ids[0])?'Confirmed':'Probable';
    const confirmed=ids.filter(id=>{const result=this.get(id)?.detect(context);if(result?.formatId===id&&result.status==='Confirmed'){evidence.push(...result.evidence.slice(0,16));return true;}return false;});
    if(confirmed.length===1){ids=[confirmed[0],...ids.filter(id=>id!==confirmed[0])];status='Confirmed';}
    if(ids.includes('matlab-source')&&ids.includes('objective-c')){
      const text=sample?new TextDecoder().decode(sample.subarray(0,8192)):'';
      const objc=/@(?:interface|implementation|protocol)\b|#import\s*[<"]/.test(text);
      const matlab=/^\s*(?:function\b|classdef\b|%[^\n]*|end\s*$)/m.test(text);
      if(objc!==matlab){ids=[objc?'objective-c':'matlab-source',objc?'matlab-source':'objective-c'];status='Probable';evidence.push({kind:'content',detail:objc?'Objective-C declaration in bounded sample':'MATLAB source marker in bounded sample'});}
      else status='Ambiguous';
    }
    if(ids.includes('perl-source')&&ids.includes('prolog-source')){
      const text=sample?new TextDecoder().decode(sample.subarray(0,8192)):'';
      const perl=/^#![^\n]*\bperl\b|\buse\s+(?:strict|warnings)\s*;|\bmy\s+[$@%]/m.test(text);
      const prolog=/^\s*:-\s*(?:module|use_module|dynamic)\b|^[^%\n]+\s*:-\s*[^\n]+\./m.test(text);
      if(perl!==prolog){ids=[perl?'perl-source':'prolog-source',perl?'prolog-source':'perl-source'];status='Probable';evidence.push({kind:'content',detail:perl?'Perl source marker in bounded sample':'Prolog source marker in bounded sample'});}
      else status='Ambiguous';
    }
    if(ids[0]==='nifti-gzip'||ids[0]==='tar-zstd')status='Probable';
    if(file.detectionSource.includes('magic')&&file.detectionSource.includes('content'))evidence.push({kind:'container',detail:'Existing detector inspected bounded container structure'});
    const signatureConflict=magicIds.length>0&&named.length>0&&!named.some(id=>magicIds.includes(id));
    return {formatId:ids[0],status,evidence,candidates:ids,conflict:conflict||signatureConflict||file.warnings.some(w=>w.code==='EXTENSION_MISMATCH'),probeBytes:sample?.byteLength??0};
  }
}
export class RoutedFormatAdapter implements FormatAdapter {
  constructor(readonly capabilities:FormatCapabilities){}
  detect(context:DetectionContext){
    checkAbort(context.signal);
    const c=this.capabilities,name=context.file.name.toLowerCase(),sample=context.sample;
    const named=c.filenames.some(n=>n.toLowerCase()===name)||c.extensions.some(e=>name.endsWith('.'+e.toLowerCase()));
    if(!named)return;
    const markers=c.detectionRules?.contentMarkers;
    if(markers?.length&&sample&&context.file.isText){const text=new TextDecoder().decode(sample.subarray(0,8192));if(markers.every(marker=>text.includes(marker)))return {formatId:c.formatId,status:'Confirmed' as const,evidence:[{kind:'content' as const,detail:'All declared literal markers occur in bounded source sample'}],candidates:[c.formatId],conflict:false,probeBytes:Math.min(sample.length,8192)};}
    return {formatId:c.formatId,status:'Probable' as const,evidence:[{kind:'filename' as const,detail:name}],candidates:[c.formatId],conflict:false,probeBytes:0};
  }
  async open(source:FileSource,options:OpenOptions):Promise<AdaptedDocument>{
    checkAbort(options.signal);
    const view=this.capabilities.supportedViews.find(v=>v.id===(options.viewId??'primary'));
    if((options.viewId??'primary')==='primary'&&this.capabilities.previewLevel==='detection-only')throw new ViewerError('UNSUPPORTED_CONTENT', `No content parser is implemented for ${this.capabilities.formatId}`);
    if(!view)throw Error('This format does not provide the selected view');
    if((view.projection==='TextDocument'||view.projection==='StructuredDocument')&&!options.file.isText&&['core.text-fallback','json','markdown','csv'].includes(view.viewerId))throw Error('Binary input cannot be interpreted as text');
    // Models, workers and native handles belong to the existing ViewerController lifecycle.
    let released=false;const release=()=>{released=true;};options.onCleanup(release);
    checkAbort(options.signal);if(released)throw Error('Adapter was released');
    return {file:options.file,source,view,release};
  }
}
export const formatIndex=new FormatIndex(formatManifest);
export function enhanceDescriptor(file:FileDescriptor,sample?:Uint8Array):FileDescriptor{
 const format=formatIndex.detect({file,sample});const capability=formatIndex.get(format.formatId)?.capabilities;
 let result={...file,format};
 if(capability&&file.isText&&!file.detectionSource.includes('magic')&&formatIndex.match(file.name).includes(format.formatId))result={...result,detectedType:capability.legacyType,languageHint:format.formatId};
 return result;
}
