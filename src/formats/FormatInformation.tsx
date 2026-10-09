import { t as tr, useUiLanguage as useLocale } from "../i18n";
import type { FileDescriptor } from '../types/files';
import { formatIndex } from './index';
export function FormatInformation({file,choose,view}:{file:FileDescriptor;choose(id:string):void;view(id:string):void}){
  useLocale();
 const detection=file.format,capability=detection&&formatIndex.get(detection.formatId)?.capabilities;
 if(!detection||!capability)return null;
 return <details className="format-information"><summary>{tr("Format information ·")}{' '}{capability.name} · {tr(detection.status)}</summary>
 <p>{capability.previewLevel==='detection-only'?tr("Recognized format; specialized preview is unavailable."):tr("Preview level: {v0}", { v0: tr(capability.previewLevel) })}</p>
 {detection.conflict&&<p role="status">{tr("Content differs from the filename hint. The detected content takes priority.")}</p>}
 <ul>{detection.evidence.map((item,i)=><li key={i}>{item.kind}: {item.detail}</li>)}</ul>
 {detection.candidates.length>1&&<label>{tr("Open as")}<select aria-label={tr("Interpret format")} value={detection.formatId} onChange={e=>choose(e.target.value)}>{detection.candidates.map(id=><option key={id} value={id}>{formatIndex.get(id)?.capabilities.name??id}</option>)}</select></label>}
 {capability.supportedViews.length>1&&<label>{tr("View as")}<select aria-label={tr("Format view")} defaultValue="primary" onChange={e=>view(e.target.value)}>{capability.supportedViews.map(v=><option key={v.id} value={v.id}>{tr(v.label)}</option>)}</select></label>}
 <p>{tr("Search:")}{' '}{capability.canSearch?tr("available within existing viewer limits"):tr("unavailable")} {' '}{tr("· Edit:")}{' '}{capability.canEdit?tr("within existing size and encoding limits"):tr("unavailable")}</p>
 <ul>{capability.limitations.map(text=><li key={text}>{tr(text)}</li>)}</ul>
 </details>;
}
