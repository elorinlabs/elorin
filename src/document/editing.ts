import {formatIndex} from '../formats';
import type {FileDescriptor} from '../types/files';
import type {DocumentKind} from './session';
/** The existing catalogue is authoritative. Source-only editing is not structural format support. */
export function editableKind(file:FileDescriptor):DocumentKind|undefined{
 if(!file.isText||file.isBinary)return;
 if(file.format&&formatIndex.get(file.format.formatId)?.capabilities.canEdit!==true)return;
 if(!['text','markdown','json','csv','tsv','yaml','xml','toml','javascript','typescript','jsx','tsx','python','c','cpp','java','go','rust','html','css','unknown'].includes(file.detectedType))return;
 return ['csv','tsv'].includes(file.detectedType)?'csv':file.detectedType==='markdown'?'markdown':file.detectedType==='json'?['jsonl','ndjson'].includes(file.extension??'')?'jsonl':'json':'text';
}
