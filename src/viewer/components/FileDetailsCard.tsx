import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { Copy, Folder, ExternalLink } from 'lucide-react';
import type { ViewerContext } from '../core/types';
import { formatBytes } from '../../services/format';
import { formatIconClass } from '../../formats/presentation';
import { writeClipboard } from '../../document/clipboard';
export function FileDetailsCard({context}:{context:ViewerContext}){
  useLocale();const {file,services}=context;const path=file.virtual?.trail.join(' › ')??file.path;const report=(e:unknown)=>window.dispatchEvent(new CustomEvent('elorin-ui-error',{detail:String(e)}));return <div className="file-details-card"><header><span className={formatIconClass(file.name,file.extension??'')}/><div><strong>{file.name}</strong><small>{file.detectedType.toUpperCase()} · {formatBytes(file.size)}</small></div></header>{services.file.openExternal&&<button className="button primary" onClick={()=>void services.file.openExternal!().catch(report)}><ExternalLink size={16}/>{tr("Open")}</button>}<div className="file-details-actions">{path&&<button onClick={()=>void writeClipboard(path).catch(report)}><Copy size={16}/>{tr("Copy Path")}</button>}{services.file.reveal&&<button onClick={()=>void services.file.reveal!().catch(report)}><Folder size={16}/>{tr("Show in Folder")}</button>}</div></div>;}
