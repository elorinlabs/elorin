import type { ViewerPlugin } from "../../core/types";
import { loadPresentation, type Presentation } from "./presentation-model";
import {
  PresentationViewer,
  PresentationInspector,
} from "./PresentationViewer";
import "../office/module10.css";
export const presentationViewerPlugin: ViewerPlugin<
  Presentation,
  Presentation
> = {
  id: "presentation",
  name: "Presentation",
  supportedTypes: ["pptx", "pptm", "ppsx", "potx", "odp", "ppt"],
  priority: 100,
  capabilities: {
    search: true,
    inspect: true,
    outline: true,
    fullscreen: true,
  },
  load: loadPresentation,
  render: (p) => <PresentationViewer {...p} />,
  inspect: (m) => m,
  renderInspection: (m) => <PresentationInspector model={m} />,
};
