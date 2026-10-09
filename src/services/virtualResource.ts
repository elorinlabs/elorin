import {VirtualFileSource} from '../vfs/VirtualFileSource';
import { detectFileSource } from "./detection/browserDetector";
import { MemoryFileSource,type FileSource } from "./fileSource";
export function safeFilename(name: string) {
  return (
    name
      .replaceAll("\\", "/")
      .split("/")
      .pop()
      ?.replace(/[\u0000-\u001f<>:"|?*]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 180) || "attachment"
  );
}
export async function virtualResource(
  name: string,
  bytes: Uint8Array,
  type = "application/octet-stream",
) {
  const safe=safeFilename(name);const provider=new MemoryFileSource(new Blob([bytes.slice().buffer],{type}));return virtualFileResource(safe,provider,crypto.randomUUID(),[safe],0,()=>{},type);
}
export async function virtualFileResource(name:string,provider:FileSource,identity:string,trail:string[],depth:number,release:()=>void=()=>{},mime=''){
 const source=new VirtualFileSource(provider,identity,depth,trail,release);try{const file=await detectFileSource(name,source,mime);file.virtual={identity,trail,containerDepth:depth};return {file,source};}catch(error){source.dispose();throw error;}
}
