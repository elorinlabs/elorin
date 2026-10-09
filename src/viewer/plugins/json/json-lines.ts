import {emptyModel,parseJsonDocument} from './json-parser';
import {JSON_CONFIG} from './json-config';
/** Reuses the strict source-offset parser; never round-trips through JS numbers/objects. */
export function parseJsonLines(source:string){
 if(source.length>JSON_CONFIG.maxBytes){const failed=emptyModel(source,'limited');failed.truncated=true;failed.diagnostics=[{kind:'warning',message:'JSON Lines exceeds the byte budget.'}];return failed;}
 const model=emptyModel(source,source.trim()?'ready':'empty');if(model.status==='empty')return model;
 model.nodes.push({id:'@records',pointer:'',key:'',type:'array',parent:-1,position:1,depth:0,offset:0,length:source.length,children:[]});model.pointers.set('',0);model.stats.nodes=1;model.stats.array=1;
 let offset=0,line=1,records=0,pointerChars=0;
 while(offset<source.length){
  const end=source.indexOf('\n',offset),next=end<0?source.length:end+1;
  const text=source.slice(offset,end<0?source.length:end).replace(/\r$/,'');
  const parsed=parseJsonDocument(text);
  if(parsed.status!=='ready'||model.nodes.length+parsed.nodes.length>JSON_CONFIG.maxNodes||parsed.stats.maxDepth+1>JSON_CONFIG.maxDepth){
   const failed=emptyModel(source,parsed.status==='limited'||parsed.status==='ready'?'limited':'invalid');failed.truncated=failed.status==='limited';failed.diagnostics=[{kind:'error',line,offset,message:parsed.diagnostics[0]?.message??(parsed.status==='empty'?'Blank JSON Lines record is invalid.':'JSON Lines exceeds the structure budget.')}];return failed;
  }
  const base=model.nodes.length,prefix=`/${records}`;
  for(const node of parsed.nodes){
   const pointer=prefix+node.pointer;pointerChars+=pointer.length;
   if(pointerChars>JSON_CONFIG.maxPointerChars){const failed=emptyModel(source,'limited');failed.truncated=true;failed.diagnostics=[{kind:'warning',message:'JSON Lines exceeds the path storage budget.'}];return failed;}
   const index=model.nodes.length;model.nodes.push({...node,id:`${pointer}@${offset+node.offset}`,pointer,key:node.parent<0?String(records):node.key,parent:node.parent<0?0:node.parent+base,position:node.parent<0?records+1:node.position,depth:node.depth+1,offset:offset+node.offset,...(node.children?{children:node.children.map(i=>i+base)}:{})});model.pointers.set(pointer,index);
  }
  model.nodes[0].children!.push(base);
  if(parsed.nodes[0].type==='object')model.nodes[0].objectItems=(model.nodes[0].objectItems??0)+1;
  else if(parsed.nodes[0].type!=='array')model.nodes[0].primitiveItems=(model.nodes[0].primitiveItems??0)+1;
  for(const key of ['nodes','object','array','string','number','boolean','null','duplicateKeys','precisionRisks'] as const)model.stats[key]+=parsed.stats[key];
  model.stats.maxDepth=Math.max(model.stats.maxDepth,parsed.stats.maxDepth+1);
  model.diagnostics.push(...parsed.diagnostics.slice(0,100-model.diagnostics.length).map(d=>({...d,line,offset:offset+(d.offset??0)})));
  offset=next;line++;records++;
 }
 return model;
}
