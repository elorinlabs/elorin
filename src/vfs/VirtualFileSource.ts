import type { FileSource } from "../services/fileSource";
import { BaseFileSource } from "../services/fileSource";
import { SourceLease } from "./types";
import { VFS_BUDGET } from "./config";
export class VirtualFileSource extends BaseFileSource {
  private released = false;
  readonly virtualIdentity: string;
  readonly containerDepth: number;
  readonly virtualTrail: string[];
  private own: SourceLease;
  readonly getMediaUrl?: FileSource["getMediaUrl"];
  constructor(
    readonly provider: FileSource,
    identity: string,
    depth: number,
    trail: string[],
    release: () => void = () => {},
  ) {
    super();
    this.virtualIdentity = identity;
    this.containerDepth = depth;
    this.virtualTrail = trail;
    this.own = new SourceLease(() => {
      provider.dispose?.();
      release();
    });
    if (provider.getMediaUrl)
      this.getMediaUrl = async (type: string) => {
        const releaseMedia = this.own.retain();
        try {
          const lease = await provider.getMediaUrl!(type);
          let done = false;
          return {
            url: lease.url,
            release: () => {
              if (done) return;
              done = true;
              lease.release();
              releaseMedia();
            },
          };
        } catch (error) {
          releaseMedia();
          throw error;
        }
      };
  }
  private ensure() {
    if (this.released) throw Error("Virtual file source is closed");
  }
  getSize() {
    this.ensure();
    return this.provider.getSize();
  }
  readRange(offset: number, length: number) {
    this.ensure();
    if (length > VFS_BUDGET.rangeBytes) throw Error("Range exceeds budget");
    return this.provider.readRange(offset, length);
  }
  get resolveRelated() {
    return this.provider.resolveRelated;
  }
  get nativeResource() {
    return this.provider.nativeResource;
  }
  async readBlob(options: { type: string; maxBytes: number }) {
    this.ensure();
    return this.provider.readBlob
      ? this.provider.readBlob(options)
      : super.readBlob(options);
  }
  dispose() {
    if (this.released) return;
    this.released = true;
    this.own.release();
  }
}
