import { formatIndex } from './index';
/** Maps manifest view families to existing sprite assets; creates no new format artwork. */
export function formatIconClass(name:string,extension:string){
 const id=formatIndex.match(name)[0],cap=id?formatIndex.get(id)?.capabilities:undefined;
 const viewer=cap?.supportedViews[0]?.viewerId;
 const family:Record<string,string>={pdf:'pdf',json:'json',archive:'zip',spreadsheet:'xlsx',csv:'xlsx',image:'webp',media:'webp',markdown:'ts','core.text-fallback':'ts',text:'ts'};
 return `sprite-file sprite-${viewer&&family[viewer] ? family[viewer] : cap?.legacyType==='typescript'?'ts':extension.replace(/[^a-z0-9]/gi,'')}`;
}
