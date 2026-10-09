import type { ReactNode } from "react";
/** Shared action contract for viewer chrome and context menus. */
export interface ViewerAction {
  primary?: boolean;
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action(): void | Promise<void>;
}
export type ContextMenuAction = ViewerAction;
