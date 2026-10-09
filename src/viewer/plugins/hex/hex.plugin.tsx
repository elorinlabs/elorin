import type { ViewerPlugin } from '../../core/types';
import { BinaryModel } from './binary-model';
import { ByteInspector, HexViewer } from './HexViewer';
export const hexViewerPlugin: ViewerPlugin<BinaryModel> = {
  id: 'hex', name: 'Binary / Hex', supportedTypes: [], capabilities: { search: true, inspect: true },
  suspension:'managed',
  async load(context) { const model = await BinaryModel.open(context.source, context.signal); context.onCleanup(() => model.dispose()); return model; },
  render(props) { return <HexViewer {...props} />; },
  slots(props) { return { rightPanel: props.activeCapability === 'inspect' ? <ByteInspector {...props} /> : undefined }; },
  dispose(_context, model) { model?.dispose(); },
};
export const hexFallbackPlugin: ViewerPlugin<BinaryModel> = { ...hexViewerPlugin, id: 'core.binary-fallback', fallback: 'binary', priority: -1000 };
