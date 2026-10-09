import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {TauriFileAdapter} from '../src/services/fileLoader';
import {resolveSample} from '../src/services/detection/browserDetector';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke,isTauri:()=>true}));
beforeEach(()=>{invoke.mockReset();});
describe('native adapter signature probe',()=>{
 it('reads authorized bounded bytes for PSD with wrong PNG suffix',async()=>{const bytes=new Uint8Array(readFileSync('tests/fixtures/module28/quadrants.psd'));const file={...resolveSample('wrong.png',new Uint8Array(),bytes.length),path:'C:\\qa\\wrong.png'};
  invoke.mockImplementation(async(command:string)=>command==='load_file'?file:Array.from(bytes));
  const result=await new TauriFileAdapter().load(file.path);expect(result.format?.formatId).toBe('psd');expect(result.format?.status).toBe('Confirmed');expect(invoke).toHaveBeenCalledWith('read_file_range',{path:file.path,offset:0,length:bytes.length});
 });
 it('does not add a second probe to native signature-confirmed PDFs',async()=>{const file={...resolveSample('document.pdf',new TextEncoder().encode('%PDF-1.7'),1000),path:'C:\\qa\\document.pdf'};invoke.mockResolvedValue(file);expect((await new TauriFileAdapter().load(file.path)).format?.formatId).toBe('pdf');expect(invoke).toHaveBeenCalledTimes(1);});
 it('caps probe at 64 KiB and propagates denied range access without a success result',async()=>{const file={...resolveSample('large.psd',new Uint8Array(),1000000),path:'C:\\qa\\large.psd'};invoke.mockImplementation(async(command:string)=>{if(command==='load_file')return file;throw Error('PERMISSION_DENIED');});await expect(new TauriFileAdapter().load(file.path)).rejects.toThrow('PERMISSION_DENIED');expect(invoke).toHaveBeenCalledWith('read_file_range',{path:file.path,offset:0,length:65536});});
});
