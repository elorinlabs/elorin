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
