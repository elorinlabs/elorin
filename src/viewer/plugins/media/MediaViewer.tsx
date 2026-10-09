import { t as tr, useUiLanguage as useLocale } from "../../../i18n";
import { emit, listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import {ViewerDiagnostic} from '../../components/ViewerDiagnostic';
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ViewerRenderProps } from "../../core/types";
import type { MediaModel } from "./media-model";
import { toggleFullscreen } from "../../../services/fullscreen";
import { useBinaryActivity } from '../hex/activity';
import { sampleWaveform } from './waveform';
import { parseSubtitles } from './subtitles';
import { safeResourcePath } from '../../../services/resourcePath';
import { checkAbort } from '../../core/errors';
import { FloatingPanel } from '../../../components/common/FloatingPanel';
import type {ReactNode} from 'react';
import {RecentMediaPanel} from './RecentMediaPanel';
function MediaControlLayer({floating,owner,close,children}:{floating:boolean;owner:object;close:()=>void;children:ReactNode}){
  useLocale();return floating?<FloatingPanel title={tr("Media Controls")} owner={owner} close={close} width={430}>{children}</FloatingPanel>:<>{children}</>;}
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function MediaInspector({ model: m }: { model: MediaModel }) {
  useLocale();
  const [, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    void m.probe?.then(() => {
      if (active) refresh((n) => n + 1);
    });
    const off = m.controller?.subscribe(() => {
      if (active) refresh((n) => n + 1);
    });
    return () => {
      active = false;
      off?.();
    };
  }, [m]);
  const f = m.metadata?.format,
    c = m.metadata?.common;
  const fields: Record<string, unknown> = {
    Container: f?.container,
    Codec: f?.codec,
    "Audio codec":
      f?.trackInfo
        .filter((t) => t.audio)
        .map((t) => t.codecName)
        .filter(Boolean)
        .join(", ") || undefined,
    "Video codec":
      f?.trackInfo
        .filter((t) => t.video)
        .map((t) => t.codecName)
        .filter(Boolean)
        .join(", ") || undefined,
    Duration: m.controller?.state.duration || f?.duration,
    Bitrate: f?.bitrate,
    "Sample rate": f?.sampleRate,
    "Bit depth": f?.bitsPerSample,
    Channels: f?.numberOfChannels,
    Title: c?.title,
    Artist: c?.artist,
    Album: c?.album,
    "Album artist": c?.albumartist,
    Track: c?.track?.no,
    Disc: c?.disk?.no,
    Year: c?.year,
    Genre: c?.genre?.join(", "),
    Composer: c?.composer?.join(", "),
    Backend: m.lease?.backend,
    Capability: m.capability,
  };
  const video = m.controller?.element as HTMLVideoElement | undefined;
  if (m.kind === "video" && video?.videoWidth) {
    fields.Resolution = `${video.videoWidth} × ${video.videoHeight}`;
    fields["Aspect ratio"] = (video.videoWidth / video.videoHeight).toFixed(3);
  }
  return (
    <div className="m11-inspection">
      <dl>
        {Object.entries(fields)
          .filter(([, v]) => v !== undefined && v !== null && v !== 0)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{tr(k)}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
      {f?.trackInfo?.map((t, i) => (
        <pre key={i}>{JSON.stringify(t, null, 2)}</pre>
      ))}
      {m.diagnostics.map((d, i) => (
        <p key={i}>{tr(d)}</p>
      ))}
      <p>
        {tr("Container support does not guarantee codec support. HDR and rotation are handled by the system decoder when supported.")}</p>
    </div>
  );
}
export function MediaViewer({
  model: m,
  context,
  session,
  updateSession,
}: ViewerRenderProps<MediaModel>) {
  useLocale();
  const [, refresh] = useState(0),
    [show, setShow] = useState(true),
    surface = useRef<HTMLElement>(null),
    mount = useRef<HTMLDivElement>(null),
    hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controller = m.controller;
  const [floatingControls,setFloatingControls]=useState(false);
  useEffect(()=>{if(!controller||!isTauri())return;const identity=crypto.randomUUID();let live=true,off:(()=>void)|undefined;const playing=()=>void emit('elorin://media-play',{identity}).catch(()=>{});controller.element.addEventListener('play',playing);void listen<{identity:string}>('elorin://media-play',event=>{if(event.payload.identity!==identity)controller.pause();}).then(fn=>{if(live)off=fn;else fn();});return()=>{live=false;off?.();controller.element.removeEventListener('play',playing);};},[controller]);
  const [wave,setWave]=useState<Awaited<ReturnType<typeof sampleWaveform>>|undefined>(),[waveError,setWaveError]=useState('');
  const waveJob=useRef<AbortController|undefined>(undefined);
  const [subtitleSource,setSubtitleSource]=useState(false),[subtitleName,setSubtitleName]=useState('captions.srt'),[subtitleNotice,setSubtitleNotice]=useState('');
  const subtitleJob=useRef<AbortController|undefined>(undefined),attachedTrack=useRef<TextTrack|undefined>(undefined);
  const active = useBinaryActivity(context.active ?? true);
  useEffect(()=>{if(active)controller?.resume();else {subtitleJob.current?.abort();controller?.suspend();}},[controller,active]);
  useEffect(()=>{if(!active){waveJob.current?.abort();setWave(undefined);}return()=>waveJob.current?.abort();},[active]);
  const waveform=async()=>{waveJob.current?.abort();const job=new AbortController();waveJob.current=job;setWaveError('');try{const result=await sampleWaveform(context.source,job.signal);if(!job.signal.aborted)setWave(result);}catch(e){if(!job.signal.aborted)setWaveError(String(e));}};
  useEffect(()=>()=>{subtitleJob.current?.abort();const track=attachedTrack.current;if(track){track.mode='disabled';for(const cue of Array.from(track.cues??[]))track.removeCue(cue);}},[]);
  const attachSubtitle=async()=>{
    subtitleJob.current?.abort();const job=new AbortController();subtitleJob.current=job;
    try{const name=safeResourcePath(subtitleName),resolve=context.source.resolveRelated??context.services.file.readRelated;if(!resolve)throw Error('Missing External Resource: select the containing folder/archive first');const resource=await resolve(name);
      try{if(await resource.source.getSize()>4*1024*1024)throw Error('Resource Limit Exceeded: subtitle attachment');const text=await resource.source.readText({maxBytes:4*1024*1024});checkAbort(job.signal);checkAbort(context.signal);const format=name.split('.').at(-1)!.toLowerCase();if(!['srt','vtt','ass','ssa','sub'].includes(format))throw Error('Recognized but Unsupported: subtitle extension');const parsed=parseSubtitles(text,format);if(parsed.cues.length>2000)throw Error('Resource Limit Exceeded: attached subtitle cues (2000)');if(!controller)throw Error('Renderer Unavailable');
        let track=attachedTrack.current;if(!track){track=controller.element.addTextTrack('subtitles',name);attachedTrack.current=track;}for(const cue of Array.from(track.cues??[]))track.removeCue(cue);
        for(const cue of parsed.cues)track.addCue(new VTTCue(cue.start/1000,cue.end/1000,cue.text.replaceAll('&','&amp;').replaceAll('<','&lt;')));track.mode='showing';setSubtitleNotice(`Attached ${parsed.cues.length} cues · plain text rendering · ${parsed.warnings.join('; ')}`);
      }finally{resource.source.dispose?.();}
    }catch(e){if(!job.signal.aborted)setSubtitleNotice(String(e));}
  };
  const audioTracks = (
    controller?.element as
      | (HTMLMediaElement & {
          audioTracks?: {
            length: number;
            [key: number]: {
              label: string;
              language: string;
              enabled: boolean;
            };
          };
        })
      | undefined
  )?.audioTracks;
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.snapshot ?? (() => undefined),
  );
  useEffect(() => {
    let active = true;
    m.probe?.then(() => {
      if (active) refresh((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [m]);
  useEffect(() => {
    if (!controller || !mount.current) return;
    const e = controller.element;
    e.hidden = false;
    mount.current.append(e);
    const restore = () => {
      const saved = session.metadata;
      if (!state?.playing && typeof saved.time === "number")
        controller.seek(saved.time);
      if (typeof saved.volume === "number") controller.setVolume(saved.volume);
      if (typeof saved.rate === "number") controller.rate(saved.rate);
    };
    e.addEventListener("loadedmetadata", restore, { once: true });
    if (e.readyState >= 1) restore();
    return () => {
      updateSession({
        metadata: {
          ...session.metadata,
          time: e.currentTime,
          volume: e.volume,
          rate: e.playbackRate,
        },
      });
      e.removeEventListener("loadedmetadata", restore);
      if (m.kind === "audio" && !e.paused) {
        controller.pause();e.remove();
      } else e.remove();
      if (hide.current) clearTimeout(hide.current);
    };
  }, [controller]);
  const full = () =>
    surface.current ? toggleFullscreen(surface.current) : Promise.resolve();
  useEffect(() =>
    context.registerActions?.([
      {
        id: "play",
        label: state?.playing ? "Pause" : "Play",
        shortcut: "Space",
        disabled: !controller,
        action: () => controller?.toggle(),
      },
      {
        id: "mute",
        label: state?.muted ? "Unmute" : "Mute",
        shortcut: "M",
        action: () => controller?.mute(),
      },
      { id: "restart", get label() { return tr("Restart"); }, action: () => controller?.seek(0) },
      {id:'waveform',get label() { return tr("Sample waveform (PCM WAV)"); },disabled:m.kind!=='audio'||!active,action:waveform},
      {id:'attach-subtitle',get label() { return tr("Attach authorized subtitle"); },disabled:m.kind!=='video',action:()=>setSubtitleSource(v=>!v)},
      { id: "fullscreen", get label() { return tr("Fullscreen"); }, shortcut: "F", action: full },
      {
        id: "copy-file",
        get label() { return tr("Copy file name"); },
        action: () => navigator.clipboard.writeText(context.file.name),
      },
      {
        id: "reveal",
        get label() { return tr("Open file location"); },
        disabled: !context.services.file.reveal,
        action: () => context.services.file.reveal?.(),
      },
    ]),
  );
  function reveal() {
    setShow(true);
    if (hide.current) clearTimeout(hide.current);
    if (m.kind === "video" && state?.playing)
      hide.current = setTimeout(() => setShow(false), 2500);
  }
  if (!controller || !state)
    return (
      <div className="m11-message">
        <h3>{tr("Playback unavailable")}</h3>
        {m.error && <ViewerDiagnostic error={m.error}/>}
      </div>
    );
  return (
    <div className="m11-media-workspace">{context.services.file.openRecent&&new URLSearchParams(location.search).get('window')!=='focus'&&<RecentMediaPanel open={context.services.file.openRecent} current={context.file.path}/>}<section
      ref={surface}
      tabIndex={0}
      className={`m11-media ${m.kind} ${show || !state.playing ? "controls-visible" : ""}`}
      onMouseMove={reveal}
      onFocus={() => setShow(true)}
      onDoubleClick={() => {
        if (m.kind === "video") void full();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input,select,textarea,button"))
          return;
        const key = e.key.toLowerCase();
        if (
          [
            " ",
            "arrowleft",
            "arrowright",
            "arrowup",
            "arrowdown",
            "m",
            "f",
          ].includes(key)
        ) {
          e.preventDefault();
          reveal();
          if (key === " ") void controller.toggle();
          if (key === "m") controller.mute();
          if (key === "f") void full();
          if (key === "arrowleft" || key === "arrowright")
            controller.seek(
              state.time +
                (key === "arrowleft" ? -1 : 1) * (e.shiftKey ? 10 : 5),
            );
          if (key === "arrowup" || key === "arrowdown")
            controller.setVolume(
              state.volume + (key === "arrowup" ? 0.05 : -0.05),
            );
        }
      }}
    >
      <div ref={mount} className="m11-media-element" />
      {m.kind === "audio" && (
        <div className="m11-track">
          {m.cover ? (
            <img className="m11-album" src={m.cover} alt={tr("Album cover")} />
          ) : (
            <div className="m11-album-placeholder">♫</div>
          )}
          <h2>{m.metadata?.common.title ?? context.file.name}</h2>
          {m.metadata?.common.artist && <p>{m.metadata.common.artist}</p>}
          <small>
            {m.metadata?.format.container ??
              context.file.extension?.toUpperCase()}
            {m.metadata?.format.sampleRate
              ? tr(" · {v0} kHz", { v0: m.metadata.format.sampleRate / 1000 })
              : ""}
            {m.metadata?.format.bitsPerSample
              ? tr(" · {v0} bit", { v0: m.metadata.format.bitsPerSample })
              : ""}
          </small>
        </div>
      )}
      {(state.error || m.error) && (
        <div className="m11-playback-error" role="status">
          <h3>{tr("Playback unavailable")}</h3>
          <ViewerDiagnostic error={state.error ?? m.error}/>
          <p>
            {tr("Container:")}{" "}
            {m.metadata?.format.container ??
              context.file.extension?.toUpperCase()}
            .{" "}
            {m.metadata?.format.codec
              ? tr("Codec: {v0}.", { v0: m.metadata.format.codec })
              : ""}{" "}
            {tr("Metadata remains available in Inspect.")}</p>
          <button
            disabled={!context.services.file.openExternal}
            onClick={() => void context.services.file.openExternal?.()}
          >
            {tr("Open externally")}</button>
        </div>
      )}
      {state.loading && !state.error && (
        <span className="m11-media-loading">{tr("Opening media…")}</span>
      )}
      <button className="media-float-trigger" data-floating-trigger onClick={()=>setFloatingControls(v=>!v)}>{tr("Media Controls")}</button>
      <MediaControlLayer floating={floatingControls} owner={context.source} close={()=>setFloatingControls(false)}><div
        className="m11-media-controls"
        onMouseEnter={() => {
          if (hide.current) clearTimeout(hide.current);
        }}
      >
        {wave&&<div aria-label={tr("Sampled waveform")}><p>{tr("Bounded sample ·")}{' '}{wave.sampledFrames} {' '}{tr("PCM frames ·")}{' '}{wave.duration.toFixed(2)} {' '}{tr("seconds · unscanned intervals are not full-file peaks")}</p><svg viewBox="0 0 512 80" style={{width:'100%',height:80}} role="img" aria-label={tr("Sampled audio peaks")}>{wave.peaks.map((v,i)=><line key={i} x1={i*512/wave.peaks.length} x2={i*512/wave.peaks.length} y1={40-v*36} y2={40+v*36} stroke="currentColor"/>)}</svg></div>}
        {waveError&&<p role="status">{waveError}</p>}
        {subtitleSource&&<div><label>{tr("Authorized sibling subtitle")}{' '}<input aria-label={tr("Subtitle relative path")} value={subtitleName} onChange={e=>setSubtitleName(e.target.value)}/></label><button onClick={()=>void attachSubtitle()}>{tr("Attach subtitle")}</button><p>{tr("No disk search; the named sibling must be in the selected folder or archive.")}</p></div>}
        {subtitleNotice&&<p role="status">{subtitleNotice}</p>}
        <div className="m11-timeline">
          <span>{time(state.time)}</span>
          <input
            aria-label={tr("Seek")}
            type="range"
            min="0"
            max={state.duration || 0}
            step=".1"
            value={Math.min(state.time, state.duration || 0)}
            disabled={!state.duration}
            onChange={(e) => controller.seek(Number(e.target.value))}
          />
          <span>{time(state.duration)}</span>
        </div>
        <div className="m11-control-row">
          <button
            onClick={() => controller.seek(state.time - 5)}
            aria-label={tr("Back five seconds")}
          >
            −5
          </button>
          <button onClick={() => void controller.toggle()}>
            {state.playing ? tr("Pause") : tr("Play")}
          </button>
          <button
            onClick={() => controller.seek(state.time + 5)}
            aria-label={tr("Forward five seconds")}
          >
            +5
          </button>
          <button onClick={() => controller.mute()}>
            {state.muted ? tr("Unmute") : tr("Mute")}
          </button>
          <input
            type="range"
            aria-label={tr("Volume")}
            min="0"
            max="1"
            step=".05"
            value={state.volume}
            onChange={(e) => controller.setVolume(Number(e.target.value))}
          />
          <select
            aria-label={tr("Playback speed")}
            value={state.rate}
            onChange={(e) => controller.rate(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
          <label><input type="checkbox" aria-label={tr("Loop playback")} onChange={e=>{controller.element.loop=e.target.checked;}}/>{tr("Loop")}</label>
          {m.kind === "video" && (
            <button onClick={() => void full()}>{tr("Fullscreen")}</button>
          )}
        </div>
        {audioTracks && audioTracks.length > 1 && (
          <select
            aria-label={tr("Audio track")}
            onChange={(e) => {
              for (let i = 0; i < audioTracks.length; i++)
                audioTracks[i].enabled = String(i) === e.target.value;
            }}
          >
            {Array.from({ length: audioTracks.length }, (_, i) => (
              <option key={i} value={i}>
                {audioTracks[i].label ||
                  audioTracks[i].language ||
                  tr("Track {v0}", { v0: i + 1 })}
              </option>
            ))}
          </select>
        )}
        {controller.element.textTracks.length > 0 && (
          <select
            aria-label={tr("Subtitle track")}
            onChange={(e) => {
              for (let i = 0; i < controller.element.textTracks.length; i++)
                controller.element.textTracks[i].mode =
                  String(i) === e.target.value ? "showing" : "disabled";
            }}
          >
            <option value="off">{tr("Subtitles off")}</option>
            {Array.from(controller.element.textTracks).map((t, i) => (
              <option key={i} value={i}>
                {t.label || t.language || tr("Track {v0}", { v0: i + 1 })}
              </option>
            ))}
          </select>
        )}
      </div></MediaControlLayer>
    </section></div>
  );
}
