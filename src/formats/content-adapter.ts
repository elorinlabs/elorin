/** Parser contract only. Detection and routing stay in FormatIndex/ViewerRegistry.
 * Input is bounded bytes or a range reader; output is an existing content model.
 * Callers run CPU parsers in their existing abortable workers and own disposal.
 * A successful detection/routing operation is never a successful parse.
 */
export interface ContentAdapter<Input, Model> {
  readonly id: string;
  readonly formats: readonly string[];
  parse(input: Input): Model | Promise<Model>;
}
export interface RangeInput {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

import bindings from './content-adapters.json';
// Keep decoder workers independent of UI/localization imports. Existing ViewerError.from
// interprets these structured codes at the caller boundary.
const parserError = (code: string, message: string) => Object.assign(new Error(message), {code});
const checkAbort = (signal?: AbortSignal) => { if(signal?.aborted) throw parserError('ABORTED', 'Loading was cancelled.'); };
type Adapters = {
  psd: typeof import('../viewer/plugins/image/image-psd').psdAdapter;
  mat: typeof import('../viewer/plugins/data/mat4-reader').mat4Adapter;
  '3ds': typeof import('../viewer/plugins/geometry/three-ds-adapter').threeDsAdapter;
};
/** Runs inside the caller's existing worker. No additional workers, data cache or handles. */
export async function loadContentAdapter<K extends keyof Adapters>(format: K, signal?: AbortSignal): Promise<Adapters[K]> {
  checkAbort(signal);
  let adapter: Adapters[keyof Adapters];
  switch (format) {
    case 'psd': adapter = (await import('../viewer/plugins/image/image-psd')).psdAdapter; break;
    case 'mat': adapter = (await import('../viewer/plugins/data/mat4-reader')).mat4Adapter; break;
    case '3ds': adapter = (await import('../viewer/plugins/geometry/three-ds-adapter')).threeDsAdapter; break;
    default: throw parserError('UNSUPPORTED_CONTENT', `No content parser registered for ${format}`);
  }
  checkAbort(signal);
  const binding = bindings.find(b => b.formats.includes(format));
  if (!binding || binding.id !== adapter.id || !adapter.formats.includes(format))
    throw parserError('LOAD_FAILED', `Content parser registration mismatch for ${format}`);
  return adapter as Adapters[K];
}
export async function parseFormat<K extends keyof Adapters>(format: K, input: Parameters<Adapters[K]['parse']>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<Adapters[K]['parse']>>> {
  const adapter = await loadContentAdapter(format, signal);
  // The keyed input/model contract is checked at every caller; union erased only at dispatch.
  type Input = Parameters<Adapters[K]['parse']>[0];
  const result = await (adapter.parse as (value: Input) => ReturnType<Adapters[K]['parse']>)(input);
  checkAbort(signal);
  return result as Awaited<ReturnType<Adapters[K]['parse']>>;
}
