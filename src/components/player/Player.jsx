import React, { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import Artwork from "../Artwork";
import SeekBar from "./SeekBar";
import TransportControls from "./TransportControls";
import VolumeControl from "./VolumeControl";
import QueuePanel from "./QueuePanel";
import LyricsPanel from "./Lyrics";
import VideoDock from "./VideoDock";
import NowPlaying from "./NowPlaying";
import { useSleepMenu } from "./SleepTimer";
import { useDominantColor } from "../../hooks/useDominantColor";
import { usePlayer } from "../../state/PlayerContext";
import { useLibrary } from "../../state/LibraryContext";
import { useTrackActions } from "../../hooks/useTrackActions";

/**
 * The persistent player. Rendered once by the app shell, outside the router
 * outlet, so navigating never remounts it and never interrupts audio.
 *
 * One component drives three presentations:
 *   - desktop bar     (>= 900px)
 *   - mobile mini bar (< 900px)
 *   - Now Playing view (desktop overlay / mobile full screen)
 * They share state and controls; only the layout differs.
 */
export default function Player() {
  const { currentTrack, isPlaying, togglePlay, sleep } = usePlayer();
  const openSleepMenu = useSleepMenu();
  const tint = useDominantColor(currentTrack?.artwork);
  const { isLiked } = useLibrary();
  const { like, openTrackMenu } = useTrackActions();
  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [videoLarge, setVideoLarge] = useState(false);
  const [nowOpen, setNowOpen] = useState(false);

  // No track ever loaded: render nothing rather than a dead bar of controls.
  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);

  return (
    <>
      <div className="player" aria-label="Player" style={tint ? { "--dominant": tint } : undefined}>
        {/* ---- mobile mini player ---- */}
        <button
          type="button"
          className="player__mini-expand"
          onClick={() => setNowOpen(true)}
          aria-label="Open now playing"
        >
          <Artwork src={currentTrack.artwork} alt="" size={40} />
          <span className="player__mini-text">
            <span className="player__mini-title">{currentTrack.title}</span>
            <span className="player__mini-artist">{currentTrack.artists?.join(", ")}</span>
          </span>
        </button>

        <div className="player__mini-controls">
          {currentTrack.source === "youtube" ? (
            <button
              type="button"
              className={`icon-btn${videoLarge ? " is-active" : ""}`}
              onClick={() => setVideoLarge((open) => !open)}
              aria-pressed={videoLarge}
              aria-label={videoLarge ? "Shrink video" : "Enlarge video"}
            >
              <Icon name="video" size={20} />
            </button>
          ) : null}
          <button
            type="button"
            className={`icon-btn${liked ? " is-liked" : ""}`}
            onClick={() => like(currentTrack)}
            aria-pressed={liked}
            aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <Icon name={liked ? "heart" : "heartOutline"} size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={24} />
          </button>
        </div>

        {/* ---- desktop: now playing ---- */}
        <div className="player__now">
          <button
            type="button"
            className="player__art-btn"
            onClick={() => setNowOpen((open) => !open)}
            aria-label={nowOpen ? "Close now playing" : "Open now playing"}
            title={nowOpen ? "Close now playing" : "Open now playing"}
          >
            <Artwork src={currentTrack.artwork} alt="" size={56} className="player__art" />
            <span className="player__art-hint" aria-hidden="true">
              <Icon name={nowOpen ? "chevronDown" : "expand"} size={18} />
            </span>
          </button>
          <div className="player__now-text">
            <span className="player__title">{currentTrack.title}</span>
            <span className="player__artists">
              {currentTrack.artists?.map((name, i) => (
                <React.Fragment key={currentTrack.artistIds?.[i] || name}>
                  {i > 0 ? ", " : ""}
                  {currentTrack.artistIds?.[i] ? (
                    <Link to={`/artist/${currentTrack.artistIds[i]}`}>{name}</Link>
                  ) : (
                    name
                  )}
                </React.Fragment>
              ))}
            </span>
          </div>
          <button
            type="button"
            className={`icon-btn player__like${liked ? " is-liked" : ""}`}
            onClick={() => like(currentTrack)}
            aria-pressed={liked}
            aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <Icon name={liked ? "heart" : "heartOutline"} size={16} />
          </button>
        </div>

        {/* ---- desktop: transport ---- */}
        <div className="player__center">
          <TransportControls />
          <SeekBar />
        </div>

        {/* ---- desktop: extras ---- */}
        <div className="player__extras">
          <button
            type="button"
            className={`icon-btn${nowOpen ? " is-active" : ""}`}
            onClick={() => setNowOpen((open) => !open)}
            aria-pressed={nowOpen}
            aria-label="Now playing view"
            title="Now playing view"
          >
            <Icon name="expand" size={18} />
          </button>
          {currentTrack.source === "youtube" && !nowOpen ? (
            <button
              type="button"
              className={`icon-btn${videoLarge ? " is-active" : ""}`}
              onClick={() => setVideoLarge((open) => !open)}
              aria-pressed={videoLarge}
              aria-label="Video"
              title="Video"
            >
              <Icon name="video" size={18} />
            </button>
          ) : null}
          <button
            type="button"
            className={`icon-btn${sleep ? " is-active" : ""}`}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              openSleepMenu({ x: rect.left - 120, y: rect.top - 260 });
            }}
            aria-label="Sleep timer"
            title={sleep ? "Sleep timer on" : "Sleep timer"}
          >
            <Icon name="moon" size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn${lyricsOpen ? " is-active" : ""}`}
            onClick={() => { setLyricsOpen((open) => !open); setQueueOpen(false); }}
            aria-pressed={lyricsOpen}
            aria-label="Lyrics"
            title="Lyrics"
          >
            <Icon name="lyrics" size={18} />
          </button>
          <button
            type="button"
            className={`icon-btn${queueOpen ? " is-active" : ""}`}
            onClick={() => { setQueueOpen((open) => !open); setLyricsOpen(false); }}
            aria-pressed={queueOpen}
            aria-label="Queue"
            title="Queue"
          >
            <Icon name="queue" size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="More options"
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              openTrackMenu(currentTrack, { x: rect.left - 180, y: rect.top - 220 });
            }}
          >
            <Icon name="more" size={18} />
          </button>
          <VolumeControl />
        </div>

        {/* Thin progress line shown on the mobile mini bar only. */}
        <div className="player__mini-progress">
          <SeekBar compact />
        </div>
      </div>

      <NowPlaying open={nowOpen} onClose={() => setNowOpen(false)} />
      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
      <LyricsPanel open={lyricsOpen} onClose={() => setLyricsOpen(false)} />
      <VideoDock
        large={videoLarge}
        stage={nowOpen}
        onToggleLarge={() => setVideoLarge((open) => !open)}
      />
    </>
  );
}
