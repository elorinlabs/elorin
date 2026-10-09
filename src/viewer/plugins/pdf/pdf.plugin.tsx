import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { loadPdf, PdfEngine } from "./pdf-engine";
import { PdfViewer, PdfInspector } from "./PdfViewer";
import "./pdf.css";
export const pdfViewerPlugin: ViewerPlugin<PdfEngine, PdfEngine> = {
  id: "pdf",
  name: "PDF",
  supportedTypes: ["pdf"],
  priority: 100,
  capabilities: {
    search: true,
    outline: true,
    inspect: true,
    zoom: true,
    fullscreen: true,
  },
  modes: [
    { id: "continuous", get label() { return tr("Continuous"); } },
    { id: "single", get label() { return tr("Single page"); } },
  ],
  load: loadPdf,
  render: (props) => <PdfViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (_, props) => <PdfInspector {...props} />,
};
