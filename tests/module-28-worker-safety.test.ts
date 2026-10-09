import {afterEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Blob as NodeBlob} from 'node:buffer';
import {resolveSample} from '../src/services/detection/browserDetector';
import {enhanceDescriptor} from '../src/formats';
import {loadImage} from '../src/viewer/plugins/image/image-model';
import {DataWorkerClient} from '../src/viewer/plugins/data/worker-client';
import type {ViewerContext} from '../src/viewer/core/types';
function setup(name:string){
 const bytes=new Uint8Array(readFileSync('tests/fixtures/module28/'+name)),abort=new AbortController(),cleanups:(()=>void)[]=[];
 const worker={terminate:vi.fn(),postMessage:vi.fn(),onmessage:undefined as any,onerror:undefined as any};
 vi.stubGlobal('Worker',class{constructor(){return worker;}});
 const context:ViewerContext={file:enhanceDescriptor(resolveSample(name,bytes,bytes.length),bytes),signal:abort.signal,services:{file:{}},source:{getSize:async()=>bytes.length,readRange:async(at,n)=>bytes.slice(at,at+n),readAll:async()=>bytes,readText:async()=>'',readBlob:async()=>new NodeBlob([bytes]) as unknown as Blob},onCleanup:fn=>{cleanups.push(fn);}};
 return {context,worker,close:()=>{abort.abort();cleanups.splice(0).forEach(fn=>fn());}};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('adapter worker cancellation and timeout',()=>{
 it('cancelled PSD decode terminates worker and cannot commit a late result',async()=>{
  const q=setup('quadrants.psd'),task=loadImage(q.context);void task.catch(()=>{});await vi.waitFor(()=>expect(q.worker.postMessage).toHaveBeenCalled());q.close();
  await expect(task).rejects.toMatchObject({code:'ABORTED'});expect(q.worker.terminate).toHaveBeenCalled();
  q.worker.onmessage({data:{ok:true,rgba:new Uint8ClampedArray(4),w:1,h:1}});await expect(task).rejects.toMatchObject({code:'ABORTED'});
 });
 it('PSD timeout releases worker and returns a diagnostic without pixels',async()=>{
  vi.useFakeTimers();const q=setup('quadrants.psd'),task=loadImage(q.context);await vi.waitFor(()=>expect(q.worker.postMessage).toHaveBeenCalled());await vi.advanceTimersByTimeAsync(30001);
  const model=await task;expect(model.error).toContain('time budget');expect(model.drawable).toBeUndefined();expect(q.worker.terminate).toHaveBeenCalled();q.close();
 });
 it('closed MAT worker rejects pending requests and ignores stale responses',async()=>{
  const q=setup('signals.mat'),client=new DataWorkerClient(q.context),task=client.call('open',{format:'mat'});void task.catch(()=>{});await vi.waitFor(()=>expect(q.worker.postMessage).toHaveBeenCalled());const id=q.worker.postMessage.mock.calls[0][0].id;q.close();
  await expect(task).rejects.toThrow('Cancelled');q.worker.onmessage({data:{id,value:['late']}});await expect(client.call('nodes')).rejects.toThrow('Cancelled');expect(q.worker.terminate).toHaveBeenCalledOnce();
 });
 it('MAT operation timeout closes worker and rejects further reads',async()=>{
  vi.useFakeTimers();const q=setup('signals.mat'),client=new DataWorkerClient(q.context),task=client.call('open',{format:'mat'});void task.catch(()=>{});await vi.waitFor(()=>expect(q.worker.postMessage).toHaveBeenCalled());await vi.advanceTimersByTimeAsync(30001);
  await expect(task).rejects.toThrow('operation timeout');await expect(client.call('page')).rejects.toThrow('Cancelled');expect(q.worker.terminate).toHaveBeenCalledOnce();q.close();
 });
});
