import type { ViewerPlugin } from "../../core/types";
import { loadEpub, type EpubModel } from "./epub-model";
import { EpubViewer, EpubInspector } from "./EpubViewer";
import "../module11.css";
export const ebookViewerPlugin: ViewerPlugin<EpubModel, EpubModel> = {
  id: "ebook",
  name: "eBook",
  supportedTypes: ["epub"],
  capabilities: { search: true, outline: true, inspect: true },
  load: loadEpub,
  render: (p) => <EpubViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <EpubInspector model={m} />,
};
