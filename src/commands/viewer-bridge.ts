import type { ViewerAction } from '../viewer/core/actions';
const actions = new WeakMap<object, Map<string,ViewerAction[]>>();
export const viewerCommands = {
  get: (source: object) => [...actions.get(source)?.values()??[]].flat(),
  register(source: object, value: ViewerAction[], owner='viewer') { let owners=actions.get(source);if(!owners){owners=new Map();actions.set(source,owners);}owners.set(owner,value); window.dispatchEvent(new Event('elorin-viewer-commands')); return () => { if (owners.get(owner) === value) { owners.delete(owner); window.dispatchEvent(new Event('elorin-viewer-commands')); } }; },
};
