import { t as tr, useUiLanguage as useLocale } from "../../i18n";
import {BrandLogo, BrandMark} from "../../design-system/Brand";
import { PanelLeftClose, PanelLeftOpen, Settings, Folder, PlusSquare } from "lucide-react";
import { primaryRoutes, libraryRoutes, type RouteId } from "../../app/routes";
import { IconButton, Tooltip } from "../common/ui";
import type { LucideIcon } from "lucide-react";
export function SidebarItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  useLocale();
  return (
    <button
      type="button"
      className={`sidebar-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon size={21} />
      <span>{label}</span>
    </button>
  );
}
export function Sidebar({
  route,
  navigate,
  collapsed,
  toggle,
  openFile,
  newFile,
}: {
  route: RouteId;
  navigate: (id: RouteId) => void;
  collapsed: boolean;
  toggle: () => void;
  openFile?: () => void;
  newFile?: () => void;
}) {
  useLocale();
  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""}`}
      aria-label={tr("Sidebar")}
    >
      <div className="brand">
        <BrandMark className="brand-logo brand-collapsed-mark" size={39}/>
        <BrandLogo className="brand-expanded-logo" height={42}/>
      </div>
      <nav aria-label={tr("Main navigation")}>
        {primaryRoutes.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            active={route === item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
      </nav>
      <nav className="sidebar-file-actions" aria-label={tr("File actions")}>
        <SidebarItem label={tr("New File")} icon={PlusSquare} active={false} onClick={() => newFile?.()}/>
        <SidebarItem label={tr("Open File")} icon={Folder} active={false} onClick={() => openFile?.()}/>
      </nav>
      <nav aria-label={tr("Library")}>
        {libraryRoutes.map((item) => (
          <SidebarItem
            key={item.id}
            {...item}
            active={route === item.id}
            onClick={() => navigate(item.id)}
          />
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className="sidebar-item settings-item"
          onClick={() => navigate("settings")}
          aria-label={tr("Settings")}
        >
          <Settings size={21} />
          <span>{tr("Settings")}</span>
        </button>
        <Tooltip label={collapsed ? tr("Expand sidebar") : tr("Collapse sidebar")}>
          <IconButton
            aria-label={collapsed ? tr("Expand sidebar") : tr("Collapse sidebar")}
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </IconButton>
        </Tooltip>
      </div>
    </aside>
  );
}
