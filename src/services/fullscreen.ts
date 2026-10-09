/** Shared Prism fullscreen surface: the document layer hides native shell chrome. */
export async function toggleFullscreen(surface: HTMLElement) {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await surface.requestFullscreen();
}
