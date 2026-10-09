import {describe,it,expect,vi} from 'vitest';
import {scientificProvider} from '../src/viewer/plugins/data/scientific-provider';
import {input} from './viewer-helpers';
const {call,close}=vi.hoisted(()=>({call:vi.fn().mockResolvedValue([]),close:vi.fn()}));
vi.mock('../src/viewer/plugins/data/worker-client',()=>({DataWorkerClient:class{call=call;close=close;source={url:async()=>undefined};}}));
describe('scientific parser selection',()=>{
 for(const formatId of ['mat','npy'])it('uses registered '+formatId+' parser when native legacy type is unknown',async()=>{
  call.mockClear();const i=input();const context={...i,file:{...i.file,detectedType:'unknown' as const,format:{formatId,status:'Probable' as const,evidence:[],candidates:[formatId],conflict:false,probeBytes:0}},signal:new AbortController().signal,onCleanup:()=>{}};
  await scientificProvider(context);expect(call).toHaveBeenCalledWith('open',expect.objectContaining({format:formatId}));
 });
});
