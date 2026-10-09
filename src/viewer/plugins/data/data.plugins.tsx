import type { ViewerPlugin } from "../../core/types";
import { DataModel } from "./data-model";
import { DatabaseViewer } from "./DatabaseViewer";
import { ColumnarViewer } from "./ColumnarViewer";
import { ScientificViewer } from "./ScientificViewer";
import { DataInspector } from "./DataInspector";
import "./data.css";
function plugin(
  id: "database" | "columnar" | "scientific",
  name: string,
  supportedTypes: ViewerPlugin["supportedTypes"],
): ViewerPlugin<DataModel, DataModel> {
  return {
    id,
    suspension:'managed',
    name,
    supportedTypes,
    priority: 110,
    capabilities: { inspect: true, search: true, outline: true },
    load: async (context) => {
      const model = new DataModel(context, id);
      void model.open();
      return model;
    },
    render: (props) =>
      id === "database" ? (
        <DatabaseViewer {...props} />
      ) : id === "columnar" ? (
        <ColumnarViewer {...props} />
      ) : (
        <ScientificViewer {...props} />
      ),
    inspect: (model) => model,
    renderInspection: (model) => <DataInspector model={model} />,
  };
}
export const databaseViewerPlugin = plugin("database", "Database", ["sqlite"]);
export const columnarViewerPlugin = plugin("columnar", "Columnar Data", [
  "parquet",
  "arrow",
  "feather",
]);
export const scientificDataViewerPlugin = plugin(
  "scientific",
  "Scientific Data",
  ["hdf5", "netcdf", "mat"],
);
