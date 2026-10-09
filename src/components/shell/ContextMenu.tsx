import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import { writeClipboard } from '../../document/clipboard';
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ContextMenuAction } from "../../viewer/core/actions";

export function ContextMenu() {
  useLocale();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    actions: ContextMenuAction[];
  }>();
  const root = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      event.preventDefault();
      if (document.querySelector('[aria-modal="true"]')) { setMenu(undefined); return; }
      const target = event.target as HTMLElement;
      const input =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
          ? target
          : undefined;
      const selected = input
        ? input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)
        : (window.getSelection()?.toString() ?? "");
      previousFocus.current = document.activeElement as HTMLElement;
      const viewer = target.closest(".viewer-host");
      const actions: ContextMenuAction[] = [
        {
          id: "copy",
          get label() { return tr("Copy"); },
          shortcut: "Ctrl+C",
          disabled:
            !selected ||
            !!viewer?.querySelector('[data-copy-restricted="true"]'),
          action: () => writeClipboard(selected),
        },
      ];
      const tab=target.closest<HTMLElement>('[data-elorin-tab]');
      if(tab) { actions.length=0;window.dispatchEvent(new CustomEvent('elorin-tab-context-actions',{detail:{id:tab.dataset.elorinTab,actions}})); }
      else if (viewer) {
        // Ask the owning viewer for the very same actions used by its chrome.
        viewer.dispatchEvent(
          new CustomEvent("prism-context-actions", { detail: actions }),
        );
      } else {
        const sidebar = document.querySelector<HTMLButtonElement>(
          '[aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]',
        );
        if (sidebar)
          actions.push({
            id: "sidebar",
            label: sidebar.getAttribute("aria-label")!,
            action: () => sidebar.click(),
          });
      }
      setMenu({ x: event.clientX, y: event.clientY, actions });
    };
    const close = () => setMenu(undefined);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("contextmenu", open);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, []);
  useLayoutEffect(() => {
    if (!menu || !root.current) return;
    const element = root.current,
      rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    element
      .querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({ preventScroll: true });
  }, [menu]);
  if (!menu) return null;
  return createPortal(
    <div
      ref={root}
      className="prism-context-menu"
      role="menu"
      aria-label={tr("Elorin actions")}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={(event) => {
        const buttons = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setMenu(undefined);
          previousFocus.current?.focus({ preventScroll: true });
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
              buttons.length
          ]?.focus();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          setMenu(undefined);
        }
      }}
    >
      {menu.actions.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          aria-label={item.label}
          disabled={item.disabled}
          className={`${item.danger ? "danger" : ""} ${item.separator ? "menu-separator" : ""}`}
          onClick={() => {
            setMenu(undefined);
            void Promise.resolve()
              .then(item.action)
              .catch(() => {
                previousFocus.current?.focus({ preventScroll: true });
              });
          }}
        >
          {item.icon}
          <span>{item.label}</span>
          <kbd>{item.shortcut}</kbd>
        </button>
      ))}
    </div>,
    document.fullscreenElement ?? document.body,
  );
}
