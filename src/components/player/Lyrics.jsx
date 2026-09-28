import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon";
import EmptyState from "../EmptyState";
import { usePlayer } from "../../state/PlayerContext";
import { useAsync } from "../../hooks/useAsync";
import { useDominantColor } from "../../hooks/useDominantColor";
import { getLyrics } from "../../services/lyrics";
import { readJSON, writeJSON } from "../../utils/storage";

const OFFSET_KEY = "lyricsOffsets";
const offsets = readJSON(OFFSET_KEY, {});

/** Per-song timing correction, remembered across sessions. */
function useLyricsOffset(trackId) {
  const [offset, setOffset] = useState(() => offsets[trackId] || 0);
  useEffect(() => { setOffset(offsets[trackId] || 0); }, [trackId]);
  const change = (delta) => {
    const next = Math.round(((offsets[trackId] || 0) + delta) * 10) / 10;
    if (next === 0) delete offsets[trackId];
    else offsets[trackId] = next;
    writeJSON(OFFSET_KEY, offsets);
    setOffset(next);
  };
  return [offset, change];
}

/** Loads lyrics for the current track and works out the active line. */
function useLyrics() {
  const { currentTrack, currentTime, duration } = usePlayer();
  const [offset, changeOffset] = useLyricsOffset(currentTrack?.id);

  const state = useAsync(
    () => getLyrics(currentTrack, currentTrack?.duration ?? duration),
    // Duration arrives just after load; waiting for it picks the right
    // recording when several versions exist.
    [currentTrack?.id, Boolean(currentTrack?.duration || duration)]
  );

  const synced = state.data?.synced?.length ? state.data.synced : null;
  // Positive offset = lyrics appear later.
  const time = currentTime - offset;

  const active = useMemo(() => {
    if (!synced) return -1;
    let found = -1;
    for (let i = 0; i < synced.length; i += 1) {
      if (synced[i].time <= time + 0.25) found = i;
      else break;
    }
    return found;
  }, [synced, time]);

  // 0..1 through the active line, for the karaoke fill.
  const progress = useMemo(() => {
    if (!synced || active < 0) return 0;
    const start = synced[active].time;
    const end = synced[active + 1]?.time ?? start + 5;
    return Math.min(1, Math.max(0, (time - start) / Math.max(0.5, end - start)));
  }, [synced, active, time]);

  return { ...state, synced, active, progress, offset, changeOffset };
}

function OffsetControl({ offset, onChange }) {
  return (
    <div className="lyrics-offset" role="group" aria-label="Lyrics timing">
      <button type="button" className="icon-btn" onClick={() => onChange(-0.5)} aria-label="Show lyrics earlier" title="Earlier">
        −
      </button>
      <span className="lyrics-offset__value" title="Timing adjustment">
        {offset === 0 ? "In sync" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}s`}
      </span>
      <button type="button" className="icon-btn" onClick={() => onChange(0.5)} aria-label="Show lyrics later" title="Later">
        +
      </button>
    </div>
  );
}

function Lines({ lyrics, karaoke = false }) {
  const { seek } = usePlayer();
  const { synced, active, progress, offset } = lyrics;
  return synced.map((line, i) => (
    <button
      type="button"
      key={`${line.time}-${i}`}
      data-line={i}
      className={`lyrics__line${i === active ? " is-active" : ""}${i < active ? " is-past" : ""}`}
      style={karaoke && i === active ? { "--fill": `${Math.round(progress * 100)}%` } : undefined}
      onClick={() => seek(line.time + offset)}
    >
      {line.text || "♪"}
    </button>
  ));
}

function useAutoScroll(ref, active) {
  useEffect(() => {
    const line = ref.current?.querySelector(`[data-line="${active}"]`);
    line?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ref, active]);
}

function Body({ lyrics, karaoke }) {
  const { data, loading, error, retry, synced } = lyrics;
  if (loading) return <p className="lyrics__status">Looking for lyrics…</p>;
  if (error) {
    return (
      <p className="lyrics__status">
        Could not reach the lyrics service.{" "}
        <button type="button" className="link-btn" onClick={retry}>Try again</button>
      </p>
    );
  }
  if (!data) return <EmptyState icon="lyrics" title="No lyrics found" message="We couldn't find lyrics for this song." />;
  if (synced) return <Lines lyrics={lyrics} karaoke={karaoke} />;
  return <p className="lyrics__plain">{data.plain}</p>;
}

/** Time-synced lyrics; clicking a line seeks to it. */
export function LyricsView({ className = "", onKaraoke }) {
  const { currentTrack } = usePlayer();
  const lyrics = useLyrics();
  const scroller = useRef(null);
  useAutoScroll(scroller, lyrics.active);

  if (!currentTrack) return null;
  return (
    <div className={`lyrics ${className}`} ref={scroller}>
      {lyrics.synced || onKaraoke ? (
        <div className="lyrics__tools">
          {lyrics.synced ? <OffsetControl offset={lyrics.offset} onChange={lyrics.changeOffset} /> : null}
          {onKaraoke && lyrics.data ? (
            <button type="button" className="btn btn--subtle" onClick={onKaraoke}>
              <Icon name="expand" size={14} /> <span>Full screen</span>
            </button>
          ) : null}
        </div>
      ) : null}
      <Body lyrics={lyrics} />
      {lyrics.data ? <p className="lyrics__credit">Lyrics via LRCLIB</p> : null}
    </div>
  );
}

/** Full-screen karaoke: big lines, the current one fills as it is sung. */
export function Karaoke({ onClose }) {
  const { currentTrack } = usePlayer();
  const lyrics = useLyrics();
  const color = useDominantColor(currentTrack?.artwork);
  const scroller = useRef(null);
  useAutoScroll(scroller, lyrics.active);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!currentTrack) return null;
  return createPortal(
    <div className="karaoke" role="dialog" aria-modal="true" aria-label="Lyrics" style={color ? { "--dominant": color } : undefined}>
      <header className="karaoke__head">
        <div>
          <p className="karaoke__title">{currentTrack.title}</p>
          <p className="karaoke__artist">{currentTrack.artists?.join(", ")}</p>
        </div>
        <div className="karaoke__tools">
          {lyrics.synced ? <OffsetControl offset={lyrics.offset} onChange={lyrics.changeOffset} /> : null}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close lyrics">
            <Icon name="close" size={22} />
          </button>
        </div>
      </header>
      <div className="karaoke__body lyrics" ref={scroller}>
        <Body lyrics={lyrics} karaoke />
      </div>
    </div>,
    document.body
  );
}

/** Slide-over panel used by the desktop player bar. */
export default function LyricsPanel({ open, onClose }) {
  const { currentTrack } = usePlayer();
  const [karaoke, setKaraoke] = useState(false);
  return (
    <>
      <aside
        className={`queue-panel lyrics-panel${open ? " is-open" : ""}`}
        aria-label="Lyrics"
        aria-hidden={!open}
        inert={open ? undefined : ""}
      >
        <header className="queue-panel__head">
          <h2>Lyrics{currentTrack ? <span className="lyrics-panel__song"> · {currentTrack.title}</span> : null}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close lyrics">
            <Icon name="close" size={18} />
          </button>
        </header>
        {open ? <LyricsView className="queue-panel__body" onKaraoke={() => setKaraoke(true)} /> : null}
      </aside>
      {karaoke ? <Karaoke onClose={() => setKaraoke(false)} /> : null}
    </>
  );
}
