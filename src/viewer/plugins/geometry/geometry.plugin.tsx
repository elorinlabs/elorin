import type { ViewerPlugin } from "../../core/types";
import type { DetectedFileType } from "../../../types/files";
import { GEOMETRY_FORMATS } from "./config";
import { GeometryModel } from "./geometry-model";
import { GeometryViewer, GeometryInspector } from "./GeometryViewer";
import "./geometry.css";
function plugin(
  id: string,
  name: string,
  formats: readonly string[],
): ViewerPlugin<GeometryModel> {
  return {
    id,
    suspension:'managed',
    name,
    supportedTypes: formats as DetectedFileType[],
    priority: 110,
    capabilities: {
      inspect: true,
      outline: true,
      measure: true,
      fullscreen: true,
    },
    load: async (context) => {
      const model = new GeometryModel(context);
      model.reload();
      return model;
    },
    render: (props) => <GeometryViewer {...props} />,
    inspect: (model) => model,
    renderInspection: (_, props) => <GeometryInspector model={props.model} />,
  };
}
export const meshViewerPlugin = plugin("mesh", "Mesh", GEOMETRY_FORMATS.mesh);
export const cadViewerPlugin = plugin("cad", "CAD", GEOMETRY_FORMATS.cad);
export const sceneViewerPlugin = plugin(
  "scene",
  "Scene",
  GEOMETRY_FORMATS.scene,
);
export const cadDrawingViewerPlugin = plugin(
  "cad-drawing",
  "Drawing",
  GEOMETRY_FORMATS.drawing,
);
