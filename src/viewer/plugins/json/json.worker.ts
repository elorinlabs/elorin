import { parseJsonDocument } from "./json-parser";
import {parseJsonLines} from './json-lines';
self.onmessage = (event: MessageEvent<string | {source:string;jsonLines:boolean}>) => {
  try {
    const source=typeof event.data==='string'?event.data:event.data.source;
    self.postMessage({ model: typeof event.data!=='string'&&event.data.jsonLines?parseJsonLines(source):parseJsonDocument(source) });
  } catch {
    self.postMessage({ error: "Unable to parse this JSON document." });
  }
};
