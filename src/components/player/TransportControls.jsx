import React from "react";
import Icon from "../Icon";
import { usePlayer, REPEAT } from "../../state/PlayerContext";
import { useRoom } from "../../state/RoomContext";

/**
 * Shuffle / previous / play / next / repeat.
 *
 * Shared by the desktop bar and the full-screen mobile player so the two can
 * never drift apart; `size` switches between the compact and expanded looks.
 */
export default function TransportControls({ size = "normal" }) {
  const {
    isPlaying, isLoading, currentTrack,
    togglePlay, skipNext, skipPrevious,
    shuffle, toggleShuffle, repeat, cycleRepeat,
  } = usePlayer();

  const { code, isHost, hostName, needsTap, sync } = useRoom();
  // In a Listen Together room only the host controls playback. A listener's
  // play button stays live only to start the host's song when the browser
  // blocked autoplay.
  const following = Boolean(code && !isHost);
  const lockedTitle = following ? `${hostName} controls playback in this room` : undefined;
  const disabled = !currentTrack || following;
  const playDisabled = following ? !needsTap : !currentTrack;
  const big = size === "large";

  const repeatLabel =
    repeat === REPEAT.ONE ? "Repeat one" : repeat === REPEAT.ALL ? "Repeat all" : "Repeat off";

  return (
    <div
      className={`transport${big ? " transport--large" : ""}${following ? " transport--following" : ""}`}
      title={lockedTitle}
    >
      <button
        type="button"
        className={`icon-btn${shuffle ? " is-active" : ""}`}
        onClick={toggleShuffle}
        disabled={following}
        aria-pressed={shuffle}
        aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
        title={lockedTitle || (shuffle ? "Shuffle on" : "Shuffle off")}
      >
        <Icon name="shuffle" size={big ? 22 : 18} />
      </button>

      <button
        type="button"
        className="icon-btn"
        onClick={skipPrevious}
        disabled={disabled}
        aria-label="Previous track"
      >
        <Icon name="previous" size={big ? 28 : 20} />
      </button>

      <button
        type="button"
        className="transport__play"
        onClick={following ? sync : togglePlay}
        disabled={playDisabled}
        aria-label={following && needsTap ? "Listen along" : isPlaying ? "Pause" : "Play"}
      >
        {isLoading && isPlaying ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <Icon name={isPlaying ? "pause" : "play"} size={big ? 30 : 20} />
        )}
      </button>

      <button
        type="button"
        className="icon-btn"
        onClick={() => skipNext(false)}
        disabled={disabled}
        aria-label="Next track"
      >
        <Icon name="next" size={big ? 28 : 20} />
      </button>

      <button
        type="button"
        className={`icon-btn${repeat !== REPEAT.OFF ? " is-active" : ""}`}
        onClick={cycleRepeat}
        disabled={following}
        aria-label={repeatLabel}
        title={lockedTitle || repeatLabel}
      >
        <Icon name="repeat" size={big ? 22 : 18} />
        {repeat === REPEAT.ONE ? <span className="transport__repeat-one" aria-hidden="true">1</span> : null}
      </button>
    </div>
  );
}
