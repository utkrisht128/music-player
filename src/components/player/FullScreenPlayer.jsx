import React, { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import Artwork from "../Artwork";
import SeekBar from "./SeekBar";
import TransportControls from "./TransportControls";
import { LyricsView, Karaoke } from "./Lyrics";
import { useSleepMenu } from "./SleepTimer";
import { useDominantColor } from "../../hooks/useDominantColor";
import { usePlayer } from "../../state/PlayerContext";
import { useLibrary } from "../../state/LibraryContext";
import { useTrackActions } from "../../hooks/useTrackActions";

/**
 * The expanded mobile player, opened by tapping the mini player.
 *
 * Mounted only while open so the CSS entry transition runs each time and the
 * off-screen artwork is not decoded on every page.
 */
export default function FullScreenPlayer({ open, onClose, onOpenQueue }) {
  const { currentTrack, contextLabel, sleep } = usePlayer();
  const openSleepMenu = useSleepMenu();
  const [karaoke, setKaraoke] = useState(false);
  const { isLiked } = useLibrary();
  const { like, openTrackMenu } = useTrackActions();
  const [showLyrics, setShowLyrics] = useState(false);
  const tint = useDominantColor(currentTrack?.artwork);

  if (!open || !currentTrack) return null;
  const liked = isLiked(currentTrack.id);

  return (
    <div
      className="fsp"
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      style={tint ? { "--dominant": tint } : undefined}
    >
      <header className="fsp__head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player">
          <Icon name="chevronDown" size={24} />
        </button>
        <span className="fsp__context">{contextLabel || "Now playing"}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="More options"
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openTrackMenu(currentTrack, { x: rect.left - 180, y: rect.bottom + 8 });
          }}
        >
          <Icon name="more" size={22} />
        </button>
      </header>

      {showLyrics ? (
        <LyricsView className="fsp__lyrics" onKaraoke={() => setKaraoke(true)} />
      ) : currentTrack.source === "youtube" ? (
        // The YouTube video docks into this slot (see VideoDock).
        <div className="fsp__art fsp__art--video" aria-hidden="true" />
      ) : (
        <div className="fsp__art">
          <Artwork src={currentTrack.artwork} alt={`${currentTrack.title} artwork`} lazy={false} />
        </div>
      )}

      <div className="fsp__meta">
        <div className="fsp__text">
          <h1 className="fsp__title">{currentTrack.title}</h1>
          <p className="fsp__artist">
            {currentTrack.artists?.map((name, i) => (
              <React.Fragment key={currentTrack.artistIds?.[i] || name}>
                {i > 0 ? ", " : ""}
                {currentTrack.artistIds?.[i] ? (
                  <Link to={`/artist/${currentTrack.artistIds[i]}`} onClick={onClose}>
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </React.Fragment>
            ))}
          </p>
        </div>
        <button
          type="button"
          className={`icon-btn fsp__like${liked ? " is-liked" : ""}`}
          onClick={() => like(currentTrack)}
          aria-pressed={liked}
          aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
        >
          <Icon name={liked ? "heart" : "heartOutline"} size={26} />
        </button>
      </div>

      <SeekBar />
      <TransportControls size="large" />

      <footer className="fsp__foot">
        <button
          type="button"
          className={`btn btn--subtle${showLyrics ? " is-active" : ""}`}
          onClick={() => setShowLyrics((value) => !value)}
          aria-pressed={showLyrics}
        >
          <Icon name="lyrics" size={18} />
          <span>Lyrics</span>
        </button>
        <button
          type="button"
          className={`btn btn--subtle${sleep ? " is-active" : ""}`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            openSleepMenu({ x: rect.left, y: rect.top - 260 });
          }}
          aria-label="Sleep timer"
        >
          <Icon name="moon" size={18} />
        </button>
        <button type="button" className="btn btn--subtle" onClick={onOpenQueue}>
          <Icon name="queue" size={18} />
          <span>Queue</span>
        </button>
      </footer>
      {karaoke ? <Karaoke onClose={() => setKaraoke(false)} /> : null}
    </div>
  );
}
