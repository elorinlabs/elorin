import type { FileDescriptor, DetectedFileType } from '../types/files';
import type { FileSource } from '../services/fileSource';
export type DetectionStatus = 'Confirmed' | 'Probable' | 'Ambiguous' | 'Unknown';
export type ProjectionKind = 'TextDocument' | 'StructuredDocument' | 'TabularDataProvider' | 'DocumentPages' | 'ImageDocument' | 'GeometryDocument' | 'ContainerDocument' | 'ScientificDataset' | 'TimelineDocument' | 'BinaryDocument';
export interface FormatView { id: string; viewerId: string; projection: ProjectionKind; label: string }
export interface FormatCapabilities {
  formatId: string; name: string; aliases: string[]; extensions: string[]; filenames: string[];
  detectionStatus: 'implemented' | 'reserved'; previewLevel: 'detection-only' | 'basic-text' | 'basic-structure' | 'partial' | 'native';
  supportedViews: FormatView[]; canInspect: boolean; canSearch: boolean; canEdit: boolean; canSave: boolean;
  supportsVirtualSource: boolean; supportsRandomAccess: boolean; dependencies: string[]; limitations: string[];
  resourceDependencies: string[]; isolation: 'in-process' | 'worker' | 'native' | 'isolated-process-reserved';
  association: { allowed: boolean; recommended: boolean; category: string }; legacyType: DetectedFileType;
  ambiguityGroup?: string;
  sourceLanguage?: string;
  detectionRules?: {
    backend: 'existing-bounded-detector' | 'static';
    magic?: {offset:number;bytes:number[]}[];
    mimeTypes?: string[];
    contentMarkers?: string[];
    containerEntries?: string[];
  };
}
export interface DetectionEvidence { kind: 'filename' | 'extension' | 'magic' | 'mime' | 'content' | 'container' | 'user'; detail: string }
export interface FormatDetection { formatId: string; status: DetectionStatus; evidence: DetectionEvidence[]; candidates: string[]; conflict: boolean; probeBytes: number }
export interface DetectionContext { file: FileDescriptor; sample?: Uint8Array; signal?: AbortSignal }
/** A projection routes to an existing model-owning Viewer, without copying its binary data. */
export interface AdaptedDocument { file: FileDescriptor; source: FileSource; view: FormatView; release(): void }
export interface OpenOptions { file: FileDescriptor; signal: AbortSignal; viewId?: string; onCleanup(cleanup: () => void): void }
export interface FormatAdapter {
  readonly capabilities: FormatCapabilities;
  detect(context: DetectionContext): FormatDetection | undefined;
  open(source: FileSource, options: OpenOptions): Promise<AdaptedDocument>;
}
