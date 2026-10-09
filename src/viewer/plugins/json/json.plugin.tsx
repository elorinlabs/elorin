import { t as tr } from "../../../i18n";
import type { FileDescriptor } from "../../../types/files";
import type { ViewerPlugin } from "../../core/types";
import type { JsonDocumentModel } from "./json-model";
import { loadJson } from "./json-load";
import { JsonViewer } from "./JsonViewer";
import { JsonInspector } from "./JsonInspector";
import "./json.css";
export function canHandleJson(file: FileDescriptor) {
  return (
    file.isText &&
    (file.detectedType === "json" ||
      ["application/json", "application/geo+json", "text/json"].includes(
        file.mimeType?.split(";")[0].trim().toLowerCase() ?? "",
      ))
  );
}
export const jsonViewerPlugin: ViewerPlugin<
  JsonDocumentModel,
  JsonDocumentModel
> = {
  id: "json",
  name: "JSON",
  supportedTypes: ["json"],
  priority: 100,
  canHandle: canHandleJson,
  capabilities: { canEdit: true, canSaveAs: true, source: true, inspect: true, search: true },
  modes: [
    { id: "tree", get label() { return tr("Tree"); } },
    { id: "split", get label() { return tr("Split"); } },
    { id: "source", get label() { return tr("Source"); } },
  ],
  load: loadJson,
  render: (props) => <JsonViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (model, props) => (
    <JsonInspector
      model={model}
      selected={Number(props.session.metadata.jsonSelected ?? 0)}
    />
  ),
};
