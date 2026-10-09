import PostalMime from "postal-mime";
self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const email = await PostalMime.parse(e.data, {
      maxNestingDepth: 24,
      maxHeadersSize: 262144,
      maxRfc822NestingDepth: 0,
      attachmentEncoding: "arraybuffer",
    });
    self.postMessage(
      { email },
      { transfer: email.attachments.map((a) => a.content as ArrayBuffer) },
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Malformed MIME message.",
    });
  }
};
