import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import Artwork from "./Artwork";
import { usePlayer } from "../state/PlayerContext";
import { formatTotalDuration, pluralize } from "../utils/format";
import { ensureDuration, onDuration } from "../utils/durationCache";

/**
 * Shared hero for playlists, albums, artists and Liked Songs.
 *
 * The total duration is summed from real file metadata and only shown once
 * every track has reported one — a partial sum would understate the total and
 * quietly mislead.
 */
export default function CollectionHeader({
  kind,
  title,
  description,
  artwork,
  round = false,
  tracks = [],
  meta = [],
  actions,
  onPlay,
  onShuffle,
}) {
  const { isPlaying, currentTrack } = usePlayer();
  const [total, setTotal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (tracks.length === 0) { setTotal(null); return undefined; }

    const recompute = () => {
      Promise.all(tracks.map((track) => ensureDuration(track))).then((values) => {
        if (cancelled) return;
        setTotal(values.every((v) => v != null) ? values.reduce((sum, v) => sum + v, 0) : null);
      });
    };
    recompute();

    const off = onDuration(recompute);
    return () => { cancelled = true; off(); };
  }, [tracks]);

  const playingHere = tracks.some((track) => track.id === currentTrack?.id) && isPlaying;
  const totalLabel = formatTotalDuration(total);

  return (
    <header className={`collection-head${round ? " collection-head--round" : ""}`}>
      <Artwork
        src={artwork}
        alt=""
        rounded={round}
        lazy={false}
        className="collection-head__art"
      />

      <div className="collection-head__text">
        <p className="collection-head__kind">{kind}</p>
        <h1 className="collection-head__title">{title}</h1>
        {description ? <p className="collection-head__desc">{description}</p> : null}

        <p className="collection-head__meta">
          {meta.filter(Boolean).map((item, i) => (
            <React.Fragment key={item}>
              {i > 0 ? <span className="collection-head__dot"> • </span> : null}
              {item}
            </React.Fragment>
          ))}
          {tracks.length > 0 ? (
            <>
              {meta.filter(Boolean).length > 0 ? <span className="collection-head__dot"> • </span> : null}
              {pluralize(tracks.length, "song")}
              {totalLabel ? <span className="collection-head__total">, {totalLabel}</span> : null}
            </>
          ) : null}
        </p>

        <div className="collection-head__actions">
          {onPlay ? (
            <button
              type="button"
              className="collection-head__play"
              onClick={onPlay}
              disabled={tracks.length === 0}
              aria-label={playingHere ? `Pause ${title}` : `Play ${title}`}
            >
              <Icon name={playingHere ? "pause" : "play"} size={26} />
            </button>
          ) : null}
          {onShuffle ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onShuffle}
              disabled={tracks.length < 2}
            >
              <Icon name="shuffle" size={16} />
              <span>Shuffle</span>
            </button>
          ) : null}
          {actions}
        </div>
      </div>
    </header>
  );
}
