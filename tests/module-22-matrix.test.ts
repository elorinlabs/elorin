import { it,expect } from 'vitest';
import { readFileSync,writeFileSync } from 'node:fs';
import { createBuiltinRegistry } from '../src/viewer/builtins';
import { formatManifest,formatIndex } from '../src/formats';
import { detectFileSource } from '../src/services/detection/browserDetector';
import { MemoryFileSource } from '../src/services/fileSource';
import { NpyReader } from '../src/viewer/plugins/data/npy-reader';
import { parseSubtitles } from '../src/viewer/plugins/media/subtitles';
import { probeMedia } from '../src/viewer/plugins/media/media-probe';
import type { ViewerContext } from '../src/viewer/core/types';
import { createHash } from 'node:crypto';
it('validates real registry, bounded detection and parsed witness assertions for machine-readable evidence',async()=>{
 const registry=createBuiltinRegistry(),evidence:any[]=[];
 for(const c of formatManifest)for(const v of c.supportedViews)expect(registry.has(v.viewerId),`${c.formatId}/${v.viewerId}`).toBe(true);
 for(const [format,file] of [['npy','test-fixtures/advanced22/matrix.npy'],['srt','test-fixtures/advanced22/example.srt'],['vtt','test-fixtures/advanced22/example.vtt'],['ass','test-fixtures/advanced22/example.ass'],['sub','test-fixtures/advanced22/example.sub'],['wav','test-fixtures/media/audio/basic.wav'],['mp3','test-fixtures/media/audio/basic.mp3'],['flac','test-fixtures/media/audio/basic.flac'],['ogg','test-fixtures/media/audio/basic.ogg'],['opus','test-fixtures/media/audio/basic.opus'],['m4a','test-fixtures/media/audio/basic.m4a']]){
   const b=readFileSync(file),source=new MemoryFileSource(new Blob([b])),descriptor=await detectFileSource(file.split('/').at(-1)!,source);expect(descriptor.format?.formatId).toBe(format);
   const adapter=formatIndex.get(format)!;const adapted=await adapter.open(source,{file:descriptor,signal:new AbortController().signal,onCleanup:()=>{}});
   expect((await registry.resolve(descriptor,{forceId:adapted.view.viewerId}))?.id).toBe(adapted.view.viewerId);
   const assertions=['actual bytes detected by existing detector','actual adapter resolves registered Viewer'];let level=0;let flags:string[]=[];
   if(format==='npy'){const r=new NpyReader(async(at,n)=>new Uint8Array(b.subarray(at,at+n)),b.length);await r.open();const p=await r.page({node:'array',start:0,count:3,columns:[0,3],fixed:[1]});expect(p.values[2][1].raw).toBe('23');assertions.push('actual multidimensional array slice equals expected bytes');level=2;flags=['metadata'];}
   else if(['srt','vtt','ass','sub'].includes(format)){const doc=parseSubtitles(b.toString('utf8'),format);expect(doc.cues[0].start).toBe(1000);expect(doc.cues.length).toBeGreaterThan(0);assertions.push('actual cue start and nonempty content asserted');level=2;flags=['metadata'];}
   else{const context={source,file:descriptor,signal:new AbortController().signal} as unknown as ViewerContext;const metadata=await probeMedia(context);expect(metadata.format.numberOfChannels).toBeGreaterThan(0);assertions.push('actual metadata parser reports nonzero channels');level=1;flags=['metadata'];}
   evidence.push({format_id:format,fixture:file,fixture_sha256:createHash('sha256').update(b).digest('hex'),status:'passed',level,flags,test_file:'tests/module-22-matrix.test.ts',assertions});
 }
 writeFileSync('docs/qa/module-22-capability-evidence.json',JSON.stringify(evidence,null,2));
});
