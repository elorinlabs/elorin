import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { loadOffice, type OfficeModel } from "./office-model";
import { OfficeViewer, OfficeInspector } from "./OfficeViewer";
import "../pdf/pdf.css";
import "./office.css";
export const officeViewerPlugin: ViewerPlugin<OfficeModel, OfficeModel> = {
  id: "office-document",
  name: "Document",
  supportedTypes: ["docx", "odt", "rtf", "doc"],
  priority: 100,
  capabilities: {
    search: true,
    outline: true,
    inspect: true,
    fullscreen: true,
  },
  modes: [{ id: "reading", get label() { return tr("Reading"); } }],
  load: loadOffice,
  render: (props) => <OfficeViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (model) => <OfficeInspector model={model} />,
};
