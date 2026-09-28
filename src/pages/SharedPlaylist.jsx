import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import Icon from "../components/Icon";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getTracks } from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

/** Landing page for a shared playlist link (/shared?name=…&ids=…). */
export default function SharedPlaylistPage() {
  useSeo({ title: "Shared playlist", noindex: true });
  const [params] = useSearchParams();
  const name = params.get("name") || "Shared playlist";
  const ids = (params.get("ids") || "").split(",").filter(Boolean);
  const { playTracks, shufflePlay } = usePlayer();
  const { createPlaylist } = useLibrary();
  const { toast } = useUI();
  const navigate = useNavigate();

  const { data: tracks, loading, error, retry } = useAsync(() => getTracks(ids), [params.get("ids")]);

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={8} /></div>;
  if (!tracks || tracks.length === 0) {
    return <div className="page"><EmptyState icon="library" title="Nothing to show" message="This playlist link has no songs we could find." /></div>;
  }

  const save = () => {
    const playlist = createPlaylist({ name, trackIds: tracks.map((t) => t.id) });
    toast("Saved to your library", { icon: "check" });
    navigate(`/playlist/${playlist.id}`);
  };

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind="Shared playlist"
        title={name}
        artwork={tracks[0]?.artwork}
        tracks={tracks}
        onPlay={() => playTracks(tracks, 0, name)}
        onShuffle={() => shufflePlay(tracks, name)}
        actions={
          <button type="button" className="btn btn--ghost" onClick={save}>
            <Icon name="plus" size={16} />
            <span>Save to library</span>
          </button>
        }
      />
      <TrackList tracks={tracks} contextLabel={name} showAlbum />
    </div>
  );
}
