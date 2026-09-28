import React from "react";
import { useParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useAsync } from "../hooks/useAsync";
import { getMoodTracks } from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

/** A mood is a keyword filter over the song index, so it costs no quota. */
export default function MoodPage() {
  const { id } = useParams();
  const { playTracks, shufflePlay, togglePlay, currentTrack } = usePlayer();
  const { data, loading, error, retry } = useAsync(() => getMoodTracks(id), [id]);
  useSeo({
    title: data ? `${data.title} songs` : undefined,
    description: data ? `${data.title} music: a hand-picked mix of songs to play free on Resonate.` : undefined,
    image: data?.tracks?.[0]?.artwork,
  });

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={8} /></div>;
  if (!data) {
    return <div className="page"><EmptyState icon="music" title="Mood not found" /></div>;
  }

  const { title, tracks, color } = data;
  const playingHere = tracks.some((track) => track.id === currentTrack?.id);

  return (
    <div className="page page--collection" style={{ "--mood": color }}>
      <CollectionHeader
        kind="Mood"
        title={title}
        description="Picked from the latest songs in your song index."
        artwork={tracks[0]?.artwork}
        tracks={tracks}
        onPlay={() => (playingHere ? togglePlay() : playTracks(tracks, 0, title))}
        onShuffle={() => shufflePlay(tracks, title)}
      />
      {tracks.length === 0 ? (
        <EmptyState
          icon="music"
          title="Nothing here yet"
          message="The song index is still empty. Open Home once to build it."
        />
      ) : (
        <TrackList tracks={tracks} contextLabel={title} showAlbum />
      )}
    </div>
  );
}
