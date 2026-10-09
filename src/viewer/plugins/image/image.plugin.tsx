import { t as tr } from "../../../i18n";
import type { ViewerPlugin } from "../../core/types";
import { IMAGE_TYPES } from "./image-config";
import { loadImage, type ImageModel } from "./image-model";
import { ImageViewer } from "./ImageViewer";
import { ImageInspector, type ImagePixel } from "./ImageInspector";
import "./image.css";
export const imageViewerPlugin: ViewerPlugin<ImageModel, ImageModel> = {
  id: "image",
  suspension:'managed',
  name: "Image",
  supportedTypes: [...IMAGE_TYPES],
  priority: 100,
  capabilities: { inspect: true, zoom: true },
  modes: [{ id: "image", get label() { return tr("Image"); } }],
  load: loadImage,
  render: (props) => <ImageViewer {...props} />,
  inspect: (model) => model,
  renderInspection: (model, props) => (
    <ImageInspector
      model={model}
      pixel={props.session.metadata.imagePixel as ImagePixel | undefined}
    />
  ),
};
