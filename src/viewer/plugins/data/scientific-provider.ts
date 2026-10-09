import type { ViewerContext } from "../../core/types";
import { DataWorkerClient } from "./worker-client";
import { workerProvider } from "./sqlite-provider";
export async function scientificProvider(context: ViewerContext) {
  const client = new DataWorkerClient(context);
  try {
  const size = await context.source.getSize();
  let blob: Blob | undefined, url: string | undefined;
  const adapterFormat=context.file.format?.formatId;
  const format = adapterFormat&&['npy','mat'].includes(adapterFormat)?adapterFormat:context.file.detectedType;
  const header = await context.source.readRange(0, Math.min(size, 65536));
  const hdf = [0, 512, 1024, 2048, 4096, 8192, 16384, 32768].some(
    (at) =>
      header[at] === 137 &&
      new TextDecoder().decode(header.subarray(at + 1, at + 4)) === "HDF",
  );
  if (hdf) {
    url = await client.source.url();
    if (!url && context.source.readBlob && size <= L.browserSqliteBytes)
      blob = await context.source.readBlob({
        type: "application/octet-stream",
        maxBytes: size,
      });
    else if (!url)
      throw Error(
        "Materialization required: seekable scientific source unavailable",
      );
  }
  await client.call("open", { format: hdf ? "hdf5" : format, size, blob, url });
  return workerProvider(client, hdf ? 'hdf5' : format);
  } catch (e) { client.close(); throw e; }
}
import { DATA_LIMITS as L } from './config';
