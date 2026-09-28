import React from "react";
import TrackRow from "./TrackRow";
import { usePlayer } from "../state/PlayerContext";

/**
 * Renders a list of tracks and wires each row to play within THIS list.
 *
 * Passing the whole list to `playTracks` is what makes the queue reflect
 * where you pressed play: starting a track on an album queues the album, not
 * the entire catalogue.
 */
export default function TrackList({
  tracks,
  contextLabel,
  showAlbum = false,
  showArtwork = true,
  showIndex = true,
  menuContextFor,
}) {
  const { currentTrack, playTracks } = usePlayer();

  return (
    <div className="track-list" role="list">
      {showAlbum ? (
        <div className="track-list__head" aria-hidden="true">
          <span className="track-list__head-index">#</span>
          <span>Title</span>
          <span className="track-list__head-album">Album</span>
          <span className="track-list__head-time">Duration</span>
        </div>
      ) : null}

      {tracks.map((track, index) => (
        <div role="listitem" key={`${track.id}-${index}`}>
          <TrackRow
            track={track}
            index={index}
            isActive={currentTrack?.id === track.id}
            showAlbum={showAlbum}
            showArtwork={showArtwork}
            showIndex={showIndex}
            menuContext={menuContextFor ? menuContextFor(track, index) : undefined}
            onPlay={() => playTracks(tracks, index, contextLabel)}
          />
        </div>
      ))}
    </div>
  );
}
