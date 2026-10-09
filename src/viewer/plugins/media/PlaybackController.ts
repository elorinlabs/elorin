export interface PlaybackState {
  playing: boolean;
  duration: number;
  time: number;
  volume: number;
  muted: boolean;
  rate: number;
  loading: boolean;
  ended: boolean;
  error?: string;
}
const subscribers = new Set<PlaybackController>();
export class PlaybackController {
  state: PlaybackState = {
    playing: false,
    duration: 0,
    time: 0,
    volume: 1,
    muted: false,
    rate: 1,
    loading: true,
    ended: false,
  };
  private listeners = new Set<() => void>();
  private disposed = false;
  private suspended?: { url:string; time:number };
  private restoreTime?: () => void;
  suspend() {
    if(this.disposed||this.suspended)return;
    if(this.restoreTime){this.element.removeEventListener('loadedmetadata',this.restoreTime);this.restoreTime=undefined;}
    this.suspended={url:this.element.currentSrc||this.element.src,time:this.element.currentTime};
    this.pause();this.element.removeAttribute('src');this.element.load();
  }
  resume() {
    if(this.disposed||!this.suspended)return;
    const saved=this.suspended;this.suspended=undefined;
    this.restoreTime=()=>{this.restoreTime=undefined;if(!this.disposed)this.seek(saved.time);};
    this.element.addEventListener('loadedmetadata',this.restoreTime,{once:true});
    this.element.src=saved.url;this.element.load();
  }
  private update = () => {
    if (this.disposed) return;
    const e = this.element;
    const error = e.error
      ? (
          {
            1: "Playback cancelled.",
            2: "Media read failed.",
            3: "Decode failure — this stream may be damaged or unsupported.",
            4: "Unsupported codec or malformed media.",
          } as Record<number, string>
        )[e.error.code]
      : undefined;
    this.state = {
      playing: !e.paused && !e.ended,
      duration: Number.isFinite(e.duration) ? e.duration : 0,
      time: e.currentTime || 0,
      volume: e.volume,
      muted: e.muted,
      rate: e.playbackRate,
      loading: e.readyState < 2 && !error,
      ended: e.ended,
      error,
    };
    for (const f of this.listeners) f();
  };
  private events = [
    "loadedmetadata",
    "durationchange",
    "timeupdate",
    "play",
    "pause",
    "volumechange",
    "ratechange",
    "ended",
    "error",
    "waiting",
    "canplay",
    "seeked",
  ];
  constructor(readonly element: HTMLMediaElement) {
    subscribers.add(this);
    for (const event of this.events)
      element.addEventListener(event, this.update);
    element.addEventListener("play", this.coordinate);
  }
  private coordinate = () => {
    for (const p of subscribers) if (p !== this) p.pause();
  };
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  snapshot = () => this.state;
  async play() {
    if(this.disposed||this.suspended)return;
    try {
      await this.element.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      this.state = {
        ...this.state,
        loading: false,
        error:
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Playback requires a user action."
            : "Playback unavailable — unsupported codec or decode failure.",
      };
      for (const f of this.listeners) f();
    }
  }
  pause() {
    this.element.pause();
  }
  toggle() {
    return this.element.paused ? this.play() : this.pause();
  }
  seek(n: number) {
    if (Number.isFinite(n))
      this.element.currentTime = Math.max(
        0,
        Math.min(this.state.duration || Number.MAX_SAFE_INTEGER, n),
      );
  }
  setVolume(n: number) {
    this.element.volume = Math.max(0, Math.min(1, n));
  }
  mute() {
    this.element.muted = !this.element.muted;
  }
  rate(n: number) {
    if ([0.5, 0.75, 1, 1.25, 1.5, 2].includes(n)) this.element.playbackRate = n;
  }
  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    if(this.restoreTime)this.element.removeEventListener('loadedmetadata',this.restoreTime);
    this.restoreTime=undefined;this.suspended=undefined;
    for (const event of this.events)
      this.element.removeEventListener(event, this.update);
    this.element.removeEventListener("play", this.coordinate);
    this.element.removeAttribute("src");
    this.element.load();
    this.element.remove();
    this.listeners.clear();
    subscribers.delete(this);
  }
}
