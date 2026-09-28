import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import Artwork from "../Artwork";
import { QueueList, useUpcoming } from "./QueuePanel";
import { LyricsView, Karaoke } from "./Lyrics";
import SeekBar from "./SeekBar";
import TransportControls from "./TransportControls";
import { useDominantColor } from "../../hooks/useDominantColor";
import { usePlayer } from "../../state/PlayerContext";
import { useLibrary } from "../../state/LibraryContext";
import { useTrackActions } from "../../hooks/useTrackActions";

/**
 * Desktop "Now Playing" view: a big stage (video or artwork) with the
 * track's details, and a side panel for Up Next / Lyrics. It covers the
 * content area only, so the player bar below keeps all transport controls.
 *
 * On mobile it is full screen and stacks everything in one scrolling column,
 * with its own seek bar and transport since the mini player is covered.
 *
 * Rendered into <body> so no transformed ancestor can offset it.
 * For YouTube tracks the video docks into `.np__video` (see VideoDock).
 */
export default function NowPlaying({ open, onClose }) {
  const { currentTrack, contextLabel } = usePlayer();
  const { isLiked } = useLibrary();
  const { like, openTrackMenu } = useTrackActions();
  const { upcoming } = useUpcoming();
  const [tab, setTab] = useState("queue");
  const [karaoke, setKaraoke] = useState(false);
  const tint = useDominantColor(currentTrack?.artwork);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !karaoke) onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, karaoke, onClose]);

  if (!open || !currentTrack) return null;
  const liked = isLiked(currentTrack.id);
  const isVideo = currentTrack.source === "youtube";

  return createPortal(
    <section
      className="np"
      aria-label="Now playing"
      style={tint ? { "--dominant": tint } : undefined}
    >
      <div className="np__backdrop" aria-hidden="true">
        {currentTrack.artwork ? <img src={currentTrack.artwork} alt="" /> : null}
      </div>

      <div className="np__main">
        <header className="np__head">
          <button type="button" className="icon-btn np__close" onClick={onClose} aria-label="Close now playing">
            <Icon name="chevronDown" size={22} />
          </button>
          <div className="np__context">
            <span>Playing from</span>
            <strong>{contextLabel || (isVideo ? "YouTube" : "Your library")}</strong>
          </div>
          <span className="np__head-spacer" />
        </header>

        <div className="np__stage">
          {isVideo ? (
            <div className="np__video" aria-hidden="true" />
          ) : (
            <div className="np__art">
              <Artwork src={currentTrack.artwork} alt={`${currentTrack.title} artwork`} lazy={false} />
            </div>
          )}
        </div>

        <div className="np__meta">
          <div className="np__text">
            {isVideo ? <span className="np__badge"><Icon name="video" size={12} /> Music video</span> : null}
            <h1 className="np__title">{currentTrack.title}</h1>
            <p className="np__artist">
              {currentTrack.artists?.map((name, i) => (
                <React.Fragment key={currentTrack.artistIds?.[i] || name}>
                  {i > 0 ? ", " : ""}
                  {currentTrack.artistIds?.[i] ? (
                    <Link to={`/artist/${currentTrack.artistIds[i]}`} onClick={onClose}>{name}</Link>
                  ) : (
                    name
                  )}
                </React.Fragment>
              ))}
              {currentTrack.albumTitle ? <span className="np__album"> · {currentTrack.albumTitle}</span> : null}
            </p>
          </div>
          <div className="np__actions">
            <button
              type="button"
              className={`icon-btn np__action${liked ? " is-liked" : ""}`}
              onClick={() => like(currentTrack)}
              aria-pressed={liked}
              aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
              title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
            >
              <Icon name={liked ? "heart" : "heartOutline"} size={22} />
            </button>
            <button
              type="button"
              className="icon-btn np__action"
              aria-label="More options"
              aria-haspopup="menu"
              title="More options"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openTrackMenu(currentTrack, { x: rect.left - 180, y: rect.top - 220 });
              }}
            >
              <Icon name="more" size={22} />
            </button>
          </div>
        </div>

        <div className="np__controls">
          <SeekBar />
          <TransportControls size="large" />
        </div>
      </div>

      <aside className="np__side">
        <div className="np__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "queue"}
            className={`np__tab${tab === "queue" ? " is-active" : ""}`}
            onClick={() => setTab("queue")}
          >
            Up next{upcoming.length ? <span className="np__count">{upcoming.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "lyrics"}
            className={`np__tab${tab === "lyrics" ? " is-active" : ""}`}
            onClick={() => setTab("lyrics")}
          >
            Lyrics
          </button>
        </div>
        {tab === "queue" ? (
          <QueueList className="np__panel" />
        ) : (
          <LyricsView className="np__panel" onKaraoke={() => setKaraoke(true)} />
        )}
      </aside>
      {karaoke ? <Karaoke onClose={() => setKaraoke(false)} /> : null}
    </section>,
    document.body
  );
}
