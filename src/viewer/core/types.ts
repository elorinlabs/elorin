import type { ViewerAction } from "./actions";
import type { ReactNode } from "react";
import type { FileDescriptor, DetectedFileType } from "../../types/files";
import type { FileSource } from "../../services/fileSource";
import type { ViewerError } from "./errors";
export interface ViewerCapabilities {
  canEdit?: boolean;
  canSaveInPlace?: boolean;
  canSaveAs?: boolean;
  measure?: boolean;
  search?: boolean;
  source?: boolean;
  inspect?: boolean;
  outline?: boolean;
  transform?: boolean;
  export?: boolean;
  print?: boolean;
  zoom?: boolean;
  fullscreen?: boolean;
}
export interface ViewerMode {
  id: string;
  label: string;
  icon?: ReactNode;
}
export interface ViewerSessionState {
  mode?: string;
  scrollTop?: number;
  metadata: Record<string, unknown>;
}
export interface ViewerServices {
  file: {
    openExternal?: () => Promise<void>;
    reveal?: () => Promise<void>;
    focus?: () => Promise<void>;
    openRecent?: (path:string) => Promise<void>;
    openUrl?: (url: string) => Promise<void>;
    openRelated?: (relative: string) => Promise<void>;
    readRelated?: (
      relative: string,
    ) => Promise<{ file: FileDescriptor; source: FileSource }>;
    openResource?: (resource: {
      file: FileDescriptor;
      source: FileSource;
    }) => Promise<void>;
  };
}
export interface ViewerContext {
  /** Controller-owned identity; all bound I/O and late-result checks belong to this generation. */
  sessionId?: string;
  generation?: number;
  active?: boolean;
  resources?: import('../../formats/resources').FormatResourceScope;
  requestCapability?(capability: keyof ViewerCapabilities | undefined): void;
  file: FileDescriptor;
  source: FileSource;
  signal: AbortSignal;
  services: ViewerServices;
  /** Register resources immediately after allocation, including during an asynchronous load. */
  onCleanup(cleanup: () => void): void;
  /** Generic cross-viewer routing for safe source/recovery actions. */
  openViewer?(id: string): void;
  registerActions?(actions: ViewerAction[]): () => void;
}
export interface ViewerSlots {
  header?: ReactNode;
  toolbar?: ReactNode;
  leftPanel?: ReactNode;
  content?: ReactNode;
  rightPanel?: ReactNode;
  statusBar?: ReactNode;
}
export interface ViewerRenderProps<TModel = unknown> {
  model: TModel;
  context: ViewerContext;
  mode?: string;
  session: ViewerSessionState;
  updateSession(patch: Partial<ViewerSessionState>): void;
  activeCapability?: keyof ViewerCapabilities;
}
export interface ViewerPlugin<TModel = unknown, TInspect = unknown> {
  /** managed: existing activity-aware model owns suspension; default: Host cancels and reloads. */
  suspension?: 'managed';
  id: string;
  name: string;
  supportedTypes: DetectedFileType[];
  priority?: number;
  fallback?: "text" | "binary";
  canHandle?(file: FileDescriptor): boolean | Promise<boolean>;
  load(context: ViewerContext): Promise<TModel>;
  render(props: ViewerRenderProps<TModel>): ReactNode;
  slots?(props: ViewerRenderProps<TModel>): Omit<ViewerSlots, "content">;
  inspect?(model: TModel, context: ViewerContext): TInspect | Promise<TInspect>;
  renderInspection?(
    inspection: TInspect,
    props: ViewerRenderProps<TModel>,
  ): ReactNode;
  dispose?(context: ViewerContext, model?: TModel): void | Promise<void>;
  capabilities: ViewerCapabilities;
  modes?: ViewerMode[];
}
export interface LazyViewerRegistration {
  id: string;
  name: string;
  supportedTypes: DetectedFileType[];
  priority?: number;
  fallback?: "text" | "binary";
  canHandle?(file: FileDescriptor): boolean | Promise<boolean>;
  loadPlugin(): Promise<ViewerPlugin>;
}
export type ViewerState =
  | { status: "idle" }
  | { status: "suspended" }
  | { status: "cancelled" }
  | { status: "resolving" }
  | { status: "loading"; plugin: ViewerPlugin }
  | {
      status: "ready";
      plugin: ViewerPlugin;
      context: ViewerContext;
      model: unknown;
      loadTime: number;
    }
  | { status: "error"; plugin?: ViewerPlugin; error: ViewerError }
  | { status: "unsupported" };
