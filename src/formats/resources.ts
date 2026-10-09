import type { FileSource } from '../services/fileSource';
import type { FileDescriptor } from '../types/files';
import { safeResourcePath } from '../services/resourcePath';
import { checkAbort } from '../viewer/core/errors';
/** A document-local resolver; it neither grants new native paths nor downloads URLs. */
export class FormatResourceScope {
 private count=0;private bytes=0;private leases=new Set<FileSource>();private closed=false;
 constructor(private source:FileSource,private signal:AbortSignal,private limits={references:32,bytes:32*1024*1024,depth:4}){}
 async resolve(relative:string,ancestors:readonly string[]=[]):Promise<{file:FileDescriptor;source:FileSource}>{
  checkAbort(this.signal);if(this.closed)throw Error('Resource scope is closed');const safe=safeResourcePath(relative);
  if(ancestors.includes(safe)||ancestors.length>=this.limits.depth)throw Error('Cyclic or excessive resource references');
  if(++this.count>this.limits.references)throw Error('Resource reference budget reached');
  if(!this.source.resolveRelated)throw Error('Authorized sibling resource resolver is unavailable');
  const resource=await this.source.resolveRelated(safe);
  try{checkAbort(this.signal);if(this.closed)throw Error('Resource scope is closed');if(!Number.isSafeInteger(resource.file.size)||resource.file.size<0)throw Error('Invalid resource size');this.bytes+=resource.file.size;if(this.bytes>this.limits.bytes)throw Error('Resource byte budget reached');this.leases.add(resource.source);return resource;}
  catch(error){resource.source.dispose?.();throw error;}
 }
 release(source:FileSource){if(this.leases.delete(source))source.dispose?.();}
 dispose(){this.closed=true;this.leases.forEach(s=>s.dispose?.());this.leases.clear();}
}
