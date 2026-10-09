import { checkAbort } from '../../core/errors';
/** Single heavy decoder; pending jobs are bounded and abortable before allocation. */
let busy = false;
const waiting: (() => void)[] = [];
export async function acquireGeometryDecode(signal: AbortSignal) {
  checkAbort(signal);
  if (busy) {
    if(waiting.length>=8)throw Error('Geometry decode queue budget exceeded');
    await new Promise<void>((resolve,reject)=>{
      const next=()=>{signal.removeEventListener('abort',abort);resolve();};
      const abort=()=>{const i=waiting.indexOf(next);if(i>=0)waiting.splice(i,1);reject(Error('Cancelled'));};
      waiting.push(next);signal.addEventListener('abort',abort,{once:true});
    });
  } else busy=true;
  let released=false;
  const release=()=>{if(released)return;released=true;const next=waiting.shift();if(next)next();else busy=false;};
  if(signal.aborted){release();checkAbort(signal);}
  return release;
}
