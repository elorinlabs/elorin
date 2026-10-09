import type { Email } from "postal-mime";
import type { ViewerContext } from "../../core/types";
import { checkAbort } from "../../core/errors";
import {
  safeFilename,
  virtualResource,
} from "../../../services/virtualResource";
import { resolveSample } from "../../../services/detection/browserDetector";
import { OfficePackage } from "../office/OfficePackage";
import { sanitizeDocument, type SafeContent } from "../../shared/safe-document";
export interface EmailAttachment {
  id: number;
  name: string;
  mime: string;
  size: number;
  cid?: string;
  disposition?: string;
  bytes: Uint8Array;
  detected?: string;
}
export interface EmailModel {
  email?: Email;
  text: string;
  rich?: SafeContent;
  attachments: EmailAttachment[];
  diagnostics: string[];
  error?: string;
  limited?: string;
  resources?: OfficePackage;
  open: (id: number) => Promise<void>;
}
export async function loadEmail(context: ViewerContext): Promise<EmailModel> {
  const m: EmailModel = {
    text: "",
    attachments: [],
    diagnostics: [],
    open: async () => {},
  };
  if (context.file.detectedType === "msg") {
    m.limited =
      "Outlook MSG — Limited support. Outlook compound properties, body and attachments cannot be reliably decoded by this version. Open externally for the original message; no content is executed.";
    return m;
  }
  try {
    const size = await context.source.getSize();
    if (size > 64 * 1024 * 1024)
      throw Error("Message exceeds the 64 MB MIME preview budget.");
    const bytes = new Uint8Array(size);
    for (let at = 0; at < size; at += 1048576) {
      checkAbort(context.signal);
      bytes.set(
        await context.source.readRange(at, Math.min(1048576, size - at)),
        at,
      );
    }
    let email: Email;
    if (typeof Worker === "undefined")
      email = await (
        await import("postal-mime")
      ).default.parse(bytes, {
        maxNestingDepth: 24,
        maxHeadersSize: 262144,
        maxRfc822NestingDepth: 0,
        attachmentEncoding: "arraybuffer",
      });
    else {
      const worker = new Worker(new URL("./email.worker.ts", import.meta.url), {
        type: "module",
      });
      context.onCleanup(() => worker.terminate());
      email = await new Promise<Email>((resolve, reject) => {
        const finish = () => {
          worker.terminate();
          context.signal.removeEventListener("abort", abort);
        };
        const abort = () => {
          finish();
          reject(Error("Cancelled"));
        };
        context.signal.addEventListener("abort", abort, { once: true });
        worker.onmessage = (e) => {
          finish();
          e.data.error ? reject(Error(e.data.error)) : resolve(e.data.email);
        };
        worker.onerror = () => {
          finish();
          reject(Error("MIME parsing failed."));
        };
        worker.postMessage(bytes.buffer, [bytes.buffer]);
      });
    }
    checkAbort(context.signal);
    m.email = email;
    if (!email.text && !email.html && !email.attachments.length)
      throw Error("Malformed message: no readable body or attachments.");
    m.text = email.text ?? "";
    if (
      (email.html?.length ?? 0) > 8 * 1024 * 1024 ||
      m.text.length > 8 * 1024 * 1024
    )
      throw Error("Email body exceeds the 8 MB reading budget.");
    if (email.attachments.length > 128)
      throw Error("Message exceeds the 128 attachment budget.");
    let total = 0;
    const entries = new Map<string, Uint8Array>(),
      cid = new Map<string, string>();
    m.attachments = email.attachments.map((att, id) => {
      const bytes = new Uint8Array(att.content as ArrayBuffer);
      if ((total += bytes.length) > 48 * 1024 * 1024)
        throw Error("Decoded attachments exceed the 48 MB budget.");
      const name = safeFilename(att.filename ?? `attachment-${id + 1}`),
        key = `resources/${id}.${name.split(".").pop() ?? "bin"}`;
      entries.set(key, bytes);
      if (att.contentId) cid.set(att.contentId.replace(/^<|>$/g, ""), key);
      return {
        id,
        name,
        mime: att.mimeType,
        size: bytes.length,
        cid: att.contentId,
        disposition: att.disposition ?? undefined,
        bytes,
        detected: resolveSample(
          name,
          bytes.subarray(0, 65536),
          bytes.length,
          att.mimeType,
        ).detectedType,
      };
    });
    const resources = new OfficePackage(entries, context);
    m.resources = resources;
    if (email.html)
      m.rich = sanitizeDocument(
        email.html,
        (url) => {
          if (!url.toLowerCase().startsWith("cid:")) return;
          const key = cid.get(url.slice(4).replace(/^<|>$/g, ""));
          return key ? resources.image(key) : undefined;
        },
        (url) => (/^https?:\/\//i.test(url) ? url : undefined),
      );
    if (!m.text) m.text = m.rich?.text ?? "";
    if (m.rich?.blocked)
      m.diagnostics.push(
        `Remote images / active content blocked (${m.rich.blocked}).`,
      );
    m.open = async (id) => {
      checkAbort(context.signal);
      const att = m.attachments[id];
      if (!att) throw Error("Attachment is unavailable.");
      const resource = await virtualResource(att.name, att.bytes, att.mime);
      att.detected = resource.file.detectedType;
      checkAbort(context.signal);
      if (!context.services.file.openResource)
        throw Error("Open in Prism is unavailable in this host.");
      await context.services.file.openResource(resource);
    };
    context.onCleanup(() => {
      for (const att of m.attachments) att.bytes = new Uint8Array();
      m.attachments = [];
      if (m.email) m.email.attachments = [];
      m.rich = undefined;
      m.text = "";
    });
  } catch (e) {
    checkAbort(context.signal);
    m.error = e instanceof Error ? e.message : "Malformed email.";
  }
  return m;
}
