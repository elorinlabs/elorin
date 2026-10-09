import { invoke } from "@tauri-apps/api/core";
import type { ViewerContext } from "../../core/types";
import type { DataProvider, DataNode, DataRequest, DataPage } from "./types";
import { DataWorkerClient } from "./worker-client";
import { DATA_LIMITS as L } from "./config";
export async function sqliteProvider(
  context: ViewerContext,
): Promise<DataProvider> {
  const source = context.source.nativeResource;
  if (context.file.mode === "tauri" && source) {
    let handle: string | undefined = await invoke("data_sqlite_open", {
      source,
    });
    const close = () => {
      if (handle) {
        void invoke("data_sqlite_close", { handle }).catch(() => {});
        handle = undefined;
      }
    };
    context.onCleanup(close);
    if (context.signal.aborted) {
      close();
      throw Error("Cancelled");
    }
    const nodes = await invoke<DataNode[]>("data_sqlite_read", {
      handle,
      operation: "schema",
    });
    return {
      capabilities: { hierarchy: true, table: true, array: false, metadata: true, randomAccess: true, slice: false, image: false, pointCloud: false, visualization: 'loaded-sample' },
      nodes: async () => nodes,
      describe: async (id) => {
        const n = nodes.find((n) => n.id === id);
        if (!n) throw Error("Unknown table");
        return n;
      },
      read: (request: DataRequest) =>
        invoke<DataPage>("data_sqlite_read", {
          handle,
          operation: "page",
          request,
        }),
      count: (node) =>
        invoke<number>("data_sqlite_read", {
          handle,
          operation: "count",
          node,
        }),
      close,
    };
  }
  const size = await context.source.getSize();
  if (size > L.browserSqliteBytes)
    throw Error(
      "Materialization required: Browser SQLite preview is limited to 64 MiB. Open this database in Elorin desktop for lazy, large-table access.",
    );
  const client = new DataWorkerClient(context);
  await client.call("open", { format: "sqlite", size });
  return workerProvider(client, 'sqlite');
}
export function workerProvider(client: DataWorkerClient, format: string): DataProvider {
  return {
    capabilities: { hierarchy: true, table: true, array: ['hdf5', 'netcdf','npy'].includes(format), metadata: true, randomAccess: true, slice: ['hdf5', 'netcdf','npy'].includes(format), image: false, pointCloud: false, visualization: 'loaded-sample' },
    nodes: () => client.call("nodes"),
    children: (node) => client.call("children", { node }),
    describe: (node) => client.call("describe", { node }),
    read: (request) => client.call("page", request),
    count: (node) => client.call("count", { node }),
    close: () => client.close(),
  };
}
