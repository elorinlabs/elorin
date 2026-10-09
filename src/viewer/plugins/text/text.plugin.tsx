import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { loadText, type TextDocumentModel } from "./text-model";
import { TextViewer } from "./TextViewer";
import { TextInspector } from "./TextInspector";
import type { TextLineData } from "./text-engine";
import "./text.css";
export const textViewerPlugin: ViewerPlugin<
  TextDocumentModel,
  TextDocumentModel
> = {
  id: "core.text-fallback",
  name: "Text",
  supportedTypes: [],
  priority: -1000,
  fallback: "text",
  canHandle: (file) => file.isText && !file.isBinary,
  capabilities: { canEdit: true, canSaveAs: true, search: true, inspect: true },
  modes: [{ id: "text", get label() { return tr("Text"); } }],
  load: loadText,
  render: (props) => <TextViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (model, props) => (
    <TextInspector
      model={model}
      selected={props.session.metadata.textSelected as TextLineData | undefined}
    />
  ),
};
