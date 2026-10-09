export interface SubtitleCue { id:string;start:number;end:number;text:string;raw:string;style?:string }
export interface SubtitleDocument { cues:SubtitleCue[];warnings:string[];styles:string[];format:string }
export function parseSubtitles(source:string,format:string,fps?:number):SubtitleDocument {
  if(source.length>4*1024*1024)throw Error('Resource Limit Exceeded: subtitle text');
  const doc:SubtitleDocument={cues:[],warnings:[],styles:[],format};let invalid=0;
  const time=(s:string)=>{const m=/^(?:(\d{1,6}):)?(\d{2}):(\d{2})[.,](\d{2,3})$/.exec(s.trim());if(!m||Number(m[2])>59||Number(m[3])>59)return NaN;return (Number(m[1]??0)*3600+Number(m[2])*60+Number(m[3]))*1000+Number(m[4].padEnd(3,'0'));};
  const append=(start:number,end:number,text:string,raw:string,style?:string)=>{if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start){invalid++;return;}if(doc.cues.length>=20000||text.length>32768)throw Error('Resource Limit Exceeded: subtitle cue budget');doc.cues.push({id:String(doc.cues.length),start,end,text,raw,style});};
  const text=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(format==='ass'||format==='ssa'){
    let section='',fields:string[]=[];
    for(const line of text.split('\n')){if(/^\[.*\]$/.test(line.trim())){section=line.trim().toLowerCase();continue;}
      if(section.includes('styles')&&(line.startsWith('Style:')||line.startsWith('Format:'))){if(doc.styles.length<512)doc.styles.push(line.slice(0,8192));}
      if(section!=='[events]')continue;if(line.startsWith('Format:')){fields=line.slice(7).split(',').map(s=>s.trim().toLowerCase());continue;}if(!line.startsWith('Dialogue:'))continue;
      const columns=fields.length?fields:format==='ssa'?['marked','start','end','style','name','marginl','marginr','marginv','effect','text']:['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
      const parts=line.slice(9).split(',');if(parts.length<columns.length||columns.at(-1)!=='text'){invalid++;continue;}const values=[...parts.slice(0,columns.length-1),parts.slice(columns.length-1).join(',')];const get=(key:string)=>values[columns.indexOf(key)]??'';
      append(time(get('start')),time(get('end')),get('text').replace(/\{[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' '),line,get('style').trim());
    }
    doc.warnings.push('ASS/SSA text preview; effects, font layout and positioning are not rendered. Raw Events and styles are retained.');
  }else if(format==='sub'){
    if(!/^\s*\{\d+\}\{\d+\}/m.test(text))throw Error('Recognized but Unsupported: SUB variant; VobSub image subtitles are not MicroDVD text');
    let rate=fps;for(const line of text.split('\n')){const m=/^\{(\d+)\}\{(\d+)\}(.*)$/.exec(line.trim());if(!m){if(line.trim())invalid++;continue;}if(m[1]===m[2]&&['0','1'].includes(m[1])&&/^\d+(?:\.\d+)?$/.test(m[3])){rate=Number(m[3]);continue;}if(!rate||!Number.isFinite(rate)||rate<=0||rate>240)throw Error('Invalid Structure: MicroDVD requires an explicit frame rate');append(Number(m[1])*1000/rate,Number(m[2])*1000/rate,m[3].replace(/\|/g,'\n'),line);}
  }else{
    for(const block of text.split(/\n[ \t]*\n/)){const lines=block.split('\n');if(/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0]))continue;const i=lines.findIndex(s=>s.includes('-->'));if(i<0){if(block.trim())invalid++;continue;}const m=/^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[i]);if(!m){invalid++;continue;}if(format==='srt'&&i>0&&!/^\d+$/.test(lines[0].trim()))doc.warnings.push('Non-numeric SRT cue identifier retained');append(time(m[1]),time(m[2]),lines.slice(i+1).join('\n'),block);}
  }
  doc.cues.sort((a,b)=>a.start-b.start||a.end-b.end);
  let end=-1,overlaps=0;for(const cue of doc.cues){if(cue.start<end)overlaps++;end=Math.max(end,cue.end);}
  if(invalid)doc.warnings.push(`${invalid} invalid timing/structure entries omitted; use Source text to inspect original content`);if(overlaps)doc.warnings.push(`${overlaps} overlapping cues`);
  doc.warnings=[...new Set(doc.warnings)].slice(0,100);return doc;
}
