import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import type { ViewerSlots } from "../core/types";
export function ViewerShell({
  header,
  toolbar,
  leftPanel,
  content,
  rightPanel,
  statusBar,
  statusFloating = false,
}: ViewerSlots & { statusFloating?: boolean }) {
  useLocale();
  return (
    <section className="viewer-shell" aria-label={tr("File preview")}>
      {header && <header className="viewer-header">{header}</header>}
      {toolbar && <div className="viewer-toolbar">{toolbar}</div>}
      <div className="viewer-body">
        {leftPanel && (
          <aside key="left" className="viewer-panel viewer-left">{leftPanel}</aside>
        )}
        <div key="content" className="viewer-content">{content}</div>
        {rightPanel && (
          <aside key="right" className="viewer-panel viewer-right">{rightPanel}</aside>
        )}
      </div>
      {statusBar && <footer className={`viewer-status${statusFloating ? ' viewer-status-floating' : ''}`}>{statusBar}</footer>}
    </section>
  );
}
