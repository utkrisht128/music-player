import React, { useEffect, useState } from "react";
import Slider from "../Slider";
import { usePlayer } from "../../state/PlayerContext";
import { formatTime } from "../../utils/format";
import { useRoom } from "../../state/RoomContext";

/**
 * Elapsed time, seek slider, total duration.
 *
 * Duration comes from the loaded file. Until it is known the slider is
 * disabled and the total reads "-:--" rather than "00:00", which would
 * wrongly imply a zero-length track.
 *
 * In a Listen Together room only the host seeks; listeners follow, so their
 * slider shows progress but is locked.
 */
export default function SeekBar({ compact = false }) {
  const { currentTime, duration, seek, currentTrack, isPlaying } = usePlayer();
  const { code, isHost, hostName, room, hostPosition } = useRoom();
  const following = Boolean(code && !isHost);
  const roomState = room?.state;
  // A listener whose own audio isn't running in step with the host (autoplay
  // blocked, song still loading) still sees the host's progress move.
  // `isPlaying` is only the intent to play, so it can be true while nothing
  // plays; the player hasn't really started until it reports a duration.
  const showHost = Boolean(
    following && roomState?.trackId &&
    (roomState.trackId !== currentTrack?.id || (roomState.isPlaying && (!isPlaying || !duration)))
  );
  const [, tick] = useState(0);
  useEffect(() => {
    if (!showHost || !roomState?.isPlaying) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [showHost, roomState?.isPlaying]);
  const position = showHost ? hostPosition() : currentTime;
  // Until the player reports a length (YouTube only does once playing), use
  // the length we already know from the song's details or the host's.
  const roomTrack = roomState?.track;
  const known = [
    duration,
    showHost ? null : currentTrack?.duration,
    following && (showHost || roomTrack?.id === currentTrack?.id) ? roomTrack?.duration : null,
  ].find((value) => Number.isFinite(value) && value > 0);
  const length = known ?? null;
  const shown = known ? Math.min(position, length) : position;

  return (
    <div
      className={`seekbar${compact ? " seekbar--compact" : ""}${following ? " seekbar--following" : ""}`}
      title={following ? `${hostName} controls playback in this room` : undefined}
    >
      {!compact ? <span className="seekbar__time">{formatTime(shown, "0:00")}</span> : null}
      <Slider
        className="seekbar__slider"
        value={shown}
        max={known ? length : 1}
        step={0.1}
        disabled={!currentTrack || !known || following}
        ariaLabel="Seek"
        valueText={`${formatTime(shown, "0:00")} of ${formatTime(length)}`}
        onCommit={seek}
      />
      {!compact ? <span className="seekbar__time">{formatTime(length)}</span> : null}
      {following && !compact ? (
        <span className="seekbar__control-note">{hostName} is in control</span>
      ) : null}
    </div>
  );
}
