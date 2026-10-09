import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import {ViewerError} from '../core/errors';
/** Inline model/decode failures use the same vocabulary as Host failures. */
export function ViewerDiagnostic({error}:{error:unknown}) {
  useLocale();
 const diagnostic=ViewerError.from(typeof error==='string'?new Error(error):error);
 return <div role={diagnostic.diagnosticCode==='OPERATION_CANCELLED'?'status':'alert'}>
  <p>{diagnostic.userMessage}</p>
  <details><summary>{tr("技术细节")}</summary><p>{diagnostic.diagnosticCode} · {diagnostic.code}</p><pre>{diagnostic.message}</pre></details>
 </div>;
}
