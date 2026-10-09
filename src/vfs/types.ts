import type {FileSource} from '../services/fileSource';
export interface VirtualMetadata {size?:number;compressedSize?:number;modified?:number;typeHint?:string;crc?:number;method?:string;encrypted?:boolean;linkTarget?:string;attributes?:string;diagnostics?:string[]}
export interface VirtualNode {id:string;name:string;path:string;kind:'file'|'directory'|'symlink'|'hardlink'|'special';metadata:VirtualMetadata;parentId:string|null;children?:string[];openSource?():Promise<FileSource>}
export type VirtualFileNode=VirtualNode&{kind:'file';openSource():Promise<FileSource>};
export type VirtualDirectoryNode=VirtualNode&{kind:'directory';children:string[]};
/** Own one provider independently of Viewer mounts; children borrow counted leases. */
export class SourceLease {private refs=1;private closed=false;constructor(private readonly close:()=>void){} retain(){if(this.closed)throw Error('Container source has closed');this.refs++;let released=false;return()=>{if(released)return;released=true;this.release()}}release(){if(this.closed)return;if(--this.refs===0){this.closed=true;this.close()}}get count(){return this.refs}}
