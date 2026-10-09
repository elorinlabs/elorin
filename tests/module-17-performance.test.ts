import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {FormatIndex,formatIndex,formatManifest} from '../src/formats';
import {detectFileSource} from '../src/services/detection/browserDetector';
import type {FileSource} from '../src/services/fileSource';
it('records real indexed metadata and bounded probing performance',async()=>{
 const base=formatIndex.get('text')!.capabilities;
 const rules=Array.from({length:2000},(_,i)=>({...base,formatId:`perf-${i}`,extensions:[`perf${i}`],filenames:[]}));
 const start=performance.now(),index=new FormatIndex(rules),initialized=performance.now();
 let matched=0;for(let i=0;i<100000;i++)matched+=index.match(`sample.perf${i%2000}`).length;
 const lookupDone=performance.now();expect(matched).toBe(100000);
 let bytesRead=0,calls=0;const text=new TextEncoder().encode('hello world\n');
 const source={getSize:async()=>32*1024**3,readRange:async(_offset:number,length:number)=>{calls++;bytesRead+=length;const bytes=new Uint8Array(length);for(let i=0;i<length;i++)bytes[i]=text[i%text.length];return bytes;},readAll:async()=>{throw Error('Whole file read forbidden');}} as unknown as FileSource;
 const largeStart=performance.now();const large=await detectFileSource('large.custom',source);const largeDone=performance.now();
 expect(bytesRead).toBe(65536);expect(calls).toBe(1);
 const smallStart=performance.now();for(let i=0;i<100;i++)await detectFileSource('small.txt',{...source,getSize:async()=>12,readRange:async()=>text});const smallDone=performance.now();
 writeFileSync('docs/qa/module-17-performance.json',JSON.stringify({environment:'Vitest Node on current Windows host; not old i5 hardware',manifestDefinitions:formatManifest.length,indexRules:2000,indexInitializationMs:initialized-start,lookupCount:100000,lookupTotalMs:lookupDone-initialized,largeLogicalBytes:32*1024**3,largeProbeBytes:bytesRead,largeProbeCalls:calls,largeDetectionMs:largeDone-largeStart,smallDetectionCount:100,smallDetectionTotalMs:smallDone-smallStart,largeFormat:large.format?.formatId},null,2));
});
