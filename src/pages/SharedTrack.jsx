import React from "react";
import { useParams } from "react-router-dom";
import Artwork from "../components/Artwork";
import Icon from "../components/Icon";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAsync } from "../hooks/useAsync";
import { getTrack } from "../services/musicService";
import { useDominantColor } from "../hooks/useDominantColor";
import { useSeo } from "../hooks/useSeo";

/**
 * Landing page for a shared song link (/track/:id). Playback waits for a
 * tap: browsers block audio that starts without one.
 */
export default function SharedTrackPage() {
  const { id } = useParams();
  const { playTracks, currentTrack, isPlaying, togglePlay } = usePlayer();
  const { isLiked } = useLibrary();
  const { like } = useTrackActions();
  const { data: track, loading, error, retry } = useAsync(() => getTrack(decodeURIComponent(id)), [id]);
  useSeo({
    title: track ? `${track.title} – ${track.artists?.join(", ")}` : "Shared song",
    description: track ? `Listen to ${track.title} by ${track.artists?.join(", ")} free on Resonate.` : undefined,
    image: track?.artwork,
  });
  const tint = useDominantColor(track?.artwork);

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={3} /></div>;
  if (!track) {
    return (
      <div className="page">
        <EmptyState icon="music" title="Song not found" message="This link may be broken, or the song was removed." />
      </div>
    );
  }

  const isCurrent = currentTrack?.id === track.id;
  const liked = isLiked(track.id);

  return (
    <div className="page shared-track" style={tint ? { "--dominant": tint } : undefined}>
      <Artwork src={track.artwork} alt="" lazy={false} className="shared-track__art" />
      <p className="collection-head__kind">Shared song</p>
      <h1 className="shared-track__title">{track.title}</h1>
      <p className="shared-track__artist">{track.artists.join(", ")}</p>
      <div className="collection-head__actions">
        <button
          type="button"
          className="collection-head__play"
          onClick={() => (isCurrent ? togglePlay() : playTracks([track], 0, "Shared song"))}
          aria-label={isCurrent && isPlaying ? "Pause" : `Play ${track.title}`}
        >
          <Icon name={isCurrent && isPlaying ? "pause" : "play"} size={26} />
        </button>
        <button type="button" className={`btn btn--ghost${liked ? " is-liked" : ""}`} onClick={() => like(track)}>
          <Icon name={liked ? "heart" : "heartOutline"} size={16} />
          <span>{liked ? "Saved" : "Save to Liked Songs"}</span>
        </button>
      </div>
    </div>
  );
}
