import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import Artwork from "./Artwork";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useTrackActions } from "../hooks/useTrackActions";
import { formatTime } from "../utils/format";
import { ensureDuration, getCachedDuration, onDuration } from "../utils/durationCache";

/**
 * A single track in a list.
 *
 * The row itself is a <div> with role="button" only because it contains its
 * own interactive controls (like, menu, artist links) — nesting buttons
 * inside a <button> is invalid HTML and breaks keyboard traversal. It is
 * fully keyboard operable: Enter and Space play, the controls are tabbable.
 */
export default function TrackRow({
  track,
  index,
  isActive = false,
  onPlay,
  showArtwork = true,
  showAlbum = false,
  showIndex = true,
  menuContext,
}) {
  const { isPlaying } = usePlayer();
  const { isLiked } = useLibrary();
  const { openTrackMenu, like } = useTrackActions();
  const [duration, setDuration] = useState(() => getCachedDuration(track.id));

  const liked = isLiked(track.id);
  const playingHere = isActive && isPlaying;

  // Durations come from the file itself, resolved lazily and shared via the
  // cache so the same track in two lists probes only once.
  useEffect(() => {
    let cancelled = false;
    ensureDuration(track).then((value) => { if (!cancelled) setDuration(value); });
    const off = onDuration((id, value) => { if (id === track.id) setDuration(value); });
    return () => { cancelled = true; off(); };
  }, [track]);

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPlay();
    }
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    openTrackMenu(track, { x: event.clientX, y: event.clientY }, menuContext);
  };

  const openMenuFromButton = (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openTrackMenu(track, { x: rect.left, y: rect.bottom + 4 }, menuContext);
  };

  return (
    <div
      // The grid must know which optional cells were rendered: the columns are
      // positional, so a missing cell would otherwise shift every later one
      // into the wrong track.
      className={`track-row${isActive ? " is-active" : ""}${showAlbum ? " track-row--wide" : ""}${
        showArtwork ? "" : " track-row--noart"
      }${showIndex ? "" : " track-row--noindex"}`}
      role="button"
      tabIndex={0}
      aria-label={`Play ${track.title} by ${track.artists?.join(", ")}`}
      onDoubleClick={onPlay}
      onClick={onPlay}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      {showIndex ? (
        <div className="track-row__index">
          <span className="track-row__number">{index + 1}</span>
          <Icon name={playingHere ? "pause" : "play"} size={14} className="track-row__index-icon" />
          {playingHere ? <span className="track-row__bars" aria-hidden="true"><i /><i /><i /></span> : null}
        </div>
      ) : null}

      {showArtwork ? <Artwork src={track.artwork} alt="" size={40} className="track-row__art" /> : null}

      <div className="track-row__main">
        <span className="track-row__title">{track.title}</span>
        <span className="track-row__artists">
          {track.artists?.map((name, i) => (
            <React.Fragment key={track.artistIds?.[i] || name}>
              {i > 0 ? ", " : ""}
              {track.artistIds?.[i] ? (
                <Link
                  to={`/artist/${track.artistIds[i]}`}
                  className="track-row__artist-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name}
                </Link>
              ) : (
                name
              )}
            </React.Fragment>
          ))}
        </span>
      </div>

      {showAlbum ? (
        <div className="track-row__album">
          {track.albumId ? (
            <Link to={`/album/${track.albumId}`} onClick={(e) => e.stopPropagation()}>
              {track.albumTitle}
            </Link>
          ) : (
            track.albumTitle
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={`icon-btn track-row__like${liked ? " is-liked" : ""}`}
        aria-pressed={liked}
        aria-label={liked ? `Remove ${track.title} from Liked Songs` : `Save ${track.title} to Liked Songs`}
        onClick={(e) => { e.stopPropagation(); like(track); }}
      >
        <Icon name={liked ? "heart" : "heartOutline"} size={16} />
      </button>

      <span className="track-row__time">{formatTime(duration)}</span>

      <button
        type="button"
        className="icon-btn track-row__menu"
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        onClick={openMenuFromButton}
      >
        <Icon name="more" size={16} />
      </button>
    </div>
  );
}
