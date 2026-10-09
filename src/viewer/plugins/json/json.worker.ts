import { parseJsonDocument } from "./json-parser";
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ model: parseJsonDocument(event.data) });
  } catch {
    self.postMessage({ error: "Unable to parse this JSON document." });
  }
};
