import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getTracks } from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

export default function LikedPage() {
  useSeo({ title: "Liked Songs", noindex: true });
  const navigate = useNavigate();
  const { liked, unlike } = useLibrary();
  const { playTracks, shufflePlay, togglePlay, currentTrack } = usePlayer();
  const { toast } = useUI();

  const ids = useMemo(() => liked.map((entry) => entry.id), [liked]);

  const { data: tracks, loading, error, retry } = useAsync(
    () => getTracks(ids),
    [ids.join(",")],
    []
  );

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;

  const list = tracks || [];
  const playingHere = list.some((track) => track.id === currentTrack?.id);

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Playlist"
        title="Liked Songs"
        artwork={list[0]?.artwork}
        tracks={list}
        onPlay={() => (playingHere ? togglePlay() : playTracks(list, 0, "Liked Songs"))}
        onShuffle={() => shufflePlay(list, "Liked Songs")}
      />

      {loading ? (
        <SkeletonRows count={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="heart"
          title="Songs you like will appear here"
          message="Tap the heart on any track to save it."
          action="Find music"
          onAction={() => navigate("/search")}
        />
      ) : (
        <TrackList
          tracks={list}
          contextLabel="Liked Songs"
          showAlbum
          menuContextFor={(track) => ({
            extraItems: [
              {
                label: "Remove from Liked Songs",
                icon: "trash",
                danger: true,
                separatorBefore: true,
                onSelect: () => {
                  unlike(track.id);
                  toast("Removed from Liked Songs", { icon: "heartOutline" });
                },
              },
            ],
          })}
        />
      )}
    </div>
  );
}
