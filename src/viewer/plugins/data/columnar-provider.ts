import type { ViewerContext } from "../../core/types";
import { DataWorkerClient } from "./worker-client";
import { workerProvider } from "./sqlite-provider";
import type { DataNode } from './types';
export async function columnarProvider(context: ViewerContext) {
  const client = new DataWorkerClient(context);
  let nodes: DataNode[];
  try { nodes = await client.call<DataNode[]>("open", {
    format: ['parquet', 'arrow', 'feather'].includes(context.file.detectedType) ? context.file.detectedType : context.file.format?.formatId,
    size: await context.source.getSize(),
  }); } catch (e) { client.close(); throw e; }
  const provider = workerProvider(client, context.file.detectedType);
  if (String(nodes[0]?.metadata.container).startsWith('IPC stream')) provider.capabilities!.randomAccess = false;
  return provider;
}
