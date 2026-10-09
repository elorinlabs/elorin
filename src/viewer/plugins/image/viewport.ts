import { IMAGE_CONFIG } from "./image-config";
export interface ImageViewState {
  zoom: number;
  x: number;
  y: number;
  fit: "fit" | "width" | "actual" | "custom";
  rotation: number;
  background: "checker" | "light" | "dark" | "tone";
  playing: boolean;
  pixelated: boolean;
}
export const initialImageView: ImageViewState = {
  zoom: 1,
  x: 0,
  y: 0,
  fit: "fit",
  rotation: 0,
  background: "checker",
  playing: true,
  pixelated: false,
};
export function fitZoom(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  mode: "fit" | "width",
) {
  return Math.min(
    1,
    Math.max(
      0.00001,
      mode === "width"
        ? (viewportWidth - 48) / width
        : Math.min(
            (viewportWidth - 48) / width,
            (viewportHeight - 48) / height,
          ),
    ),
  );
}
export function anchoredZoom(
  view: ImageViewState,
  next: number,
  anchorX: number,
  anchorY: number,
): ImageViewState {
  next = Math.max(IMAGE_CONFIG.minZoom, Math.min(IMAGE_CONFIG.maxZoom, next));
  const ratio = next / view.zoom;
  return {
    ...view,
    zoom: next,
    x: anchorX - (anchorX - view.x) * ratio,
    y: anchorY - (anchorY - view.y) * ratio,
    fit: "custom",
  };
}
export function imageCoordinates(
  x: number,
  y: number,
  width: number,
  height: number,
  view: ImageViewState,
) {
  const angle = (-view.rotation * Math.PI) / 180,
    px = (x - view.x) / view.zoom,
    py = (y - view.y) / view.zoom;
  return {
    x: Math.floor(px * Math.cos(angle) - py * Math.sin(angle) + width / 2),
    y: Math.floor(px * Math.sin(angle) + py * Math.cos(angle) + height / 2),
  };
}
export function orientationMatrix(
  o: number,
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  return (
    (
      {
        1: [1, 0, 0, 1, 0, 0],
        2: [-1, 0, 0, 1, width, 0],
        3: [-1, 0, 0, -1, width, height],
        4: [1, 0, 0, -1, 0, height],
        5: [0, 1, 1, 0, 0, 0],
        6: [0, 1, -1, 0, height, 0],
        7: [0, -1, -1, 0, height, width],
        8: [0, -1, 1, 0, 0, width],
      } as Record<number, [number, number, number, number, number, number]>
    )[o] ?? [1, 0, 0, 1, 0, 0]
  );
}
