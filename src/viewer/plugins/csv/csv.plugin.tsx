import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { loadCsv } from "./csv-load";
import type { TabularDocumentModel } from "./csv-model";
import { CsvViewer } from "./CsvViewer";
import { CsvInspector } from "./CsvInspector";
import type { CsvSelection } from "./csv-types";
import "./csv.css";
export const csvViewerPlugin: ViewerPlugin<
  TabularDocumentModel,
  TabularDocumentModel
> = {
  id: "csv",
  name: "CSV",
  supportedTypes: ["csv", "tsv"],
  priority: 100,
  canHandle: (file) =>
    file.isText && ["csv", "tsv"].includes(file.detectedType),
  capabilities: { canEdit: true, canSaveAs: true, source: true, inspect: true, search: true },
  modes: [
    { id: "table", get label() { return tr("Table"); } },
    { id: "split", get label() { return tr("Split"); } },
    { id: "source", get label() { return tr("Source"); } },
  ],
  load: loadCsv,
  render: (props) => <CsvViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (model, props) => (
    <CsvInspector
      model={model}
      selection={
        (props.session.metadata.csvSelection as CsvSelection) ?? {
          kind: "none",
        }
      }
      header={
        typeof props.session.metadata.csvHeader === "boolean"
          ? props.session.metadata.csvHeader
          : model.dialect.detectedHeader
      }
    />
  ),
};
