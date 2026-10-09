/** Columns are 1-based; byte offsets are absolute and include the source BOM. */
export function sourcePosition(text:string, utf16:number, byteStart:number, encoding:string, tabWidth:number, malformed=false){
  let at=Math.min(text.length,Math.max(0,Math.trunc(utf16)));
  if(at>0 && at<text.length && /[\uDC00-\uDFFF]/.test(text[at]) && /[\uD800-\uDBFF]/.test(text[at-1]))at--;
  const prefix=text.slice(0,at);let visual=0,points=0;
  for(const ch of prefix){points++;visual=ch==='\t'?visual+tabWidth-(visual%tabWidth):visual+1;}
  const enc=encoding.toLowerCase().replace(/\s|bom/g,'');
  const length=enc.startsWith('utf-16')?prefix.length*2:enc==='utf-8'?new TextEncoder().encode(prefix).length:undefined;
  return {utf16:at+1,codePoint:points+1,visual:visual+1,byte:!malformed && length!==undefined?String(byteStart+length):undefined};
}
