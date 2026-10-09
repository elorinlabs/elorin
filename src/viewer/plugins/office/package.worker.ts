import { unpackOffice, OFFICE_BUDGET } from "./package";
self.onmessage = (
  event: MessageEvent<ArrayBuffer | { bytes: ArrayBuffer; large: boolean }>,
) => {
  try {
    const data = event.data;
    const entries = [
      ...unpackOffice(
        new Uint8Array(data instanceof ArrayBuffer ? data : data.bytes),
        data instanceof ArrayBuffer || !data.large
          ? OFFICE_BUDGET
          : {
              ...OFFICE_BUDGET,
              file: 128 * 1024 * 1024,
              entry: 96 * 1024 * 1024,
              total: 256 * 1024 * 1024,
            },
      ),
    ];
    self.postMessage(
      { entries },
      { transfer: entries.map(([, value]) => value.buffer) },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Document could not be unpacked.",
    });
  }
};
