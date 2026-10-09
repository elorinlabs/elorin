import {safeVirtualPath,VFS_BUDGET} from './config';
import type {VirtualNode} from './types';
/** Identity is provider/session + stable entry index, never its filename or sort position. */
export class VirtualFileSystem {
 readonly nodes=new Map<string,VirtualNode>();readonly paths=new Map<string,string[]>();readonly root:VirtualNode;
 constructor(readonly id:string,readonly name:string){this.root={id:id+':root',name,path:'',kind:'directory',parentId:null,children:[],metadata:{}};this.nodes.set(this.root.id,this.root);this.paths.set('',[this.root.id]);}
 add(node:Omit<VirtualNode,'parentId'>){const path=safeVirtualPath(node.path),parts=path.split('/');let parent=this.root;for(let i=0;i<parts.length-1;i++){const dirPath=parts.slice(0,i+1).join('/');let dir=(this.paths.get(dirPath)??[]).map(id=>this.nodes.get(id)!).find(n=>n.kind==='directory');if(!dir){dir={id:this.id+':dir:'+dirPath,name:parts[i],path:dirPath,kind:'directory',parentId:parent.id,children:[],metadata:{}};this.insert(dir,parent)}parent=dir;}
 if(node.kind==='directory'){const implicit=(this.paths.get(path)??[]).map(id=>this.nodes.get(id)!).find(n=>n.kind==='directory');if(implicit){Object.assign(implicit.metadata,node.metadata);return implicit}}
 const value:VirtualNode={...node,path,name:parts.at(-1)!,parentId:parent.id,...(node.kind==='directory'?{children:[]}: {})};if(this.paths.has(path))value.metadata.diagnostics=[...(value.metadata.diagnostics??[]),'Duplicate path — entries retain separate identities'];this.insert(value,parent);return value;
 }
 private metadataBytes=0;
 private insert(node:VirtualNode,parent:VirtualNode){const bytes=node.path.length*2+256;if(this.nodes.size>=VFS_BUDGET.entries*2||this.metadataBytes+bytes>VFS_BUDGET.metadataBytes)throw Error('Safety limit reached: virtual directory metadata');this.metadataBytes+=bytes;this.nodes.set(node.id,node);parent.children!.push(node.id);this.paths.set(node.path,[...(this.paths.get(node.path)??[]),node.id]);}
 children(id:string){return(this.nodes.get(id)?.children??[]).map(id=>this.nodes.get(id)!)}
 directory(path:string){return(this.paths.get(path)??[]).map(id=>this.nodes.get(id)!).find(n=>n.kind==='directory')??this.root}
 async search(query:string,signal:AbortSignal){const result:VirtualNode[]=[],q=query.toLocaleLowerCase();let n=0;for(const node of this.nodes.values()){if(signal.aborted)throw Error('Cancelled');if(node.path&&node.path.toLocaleLowerCase().includes(q))result.push(node);if(++n%2000===0)await new Promise(r=>setTimeout(r,0));}return result;}
}
