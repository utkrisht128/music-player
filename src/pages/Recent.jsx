import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TrackList from "../components/TrackList";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getTracks } from "../services/musicService";
import { formatRelativeTime } from "../utils/format";
import { useSeo } from "../hooks/useSeo";

/**
 * Play history, newest first. Entries are written when audio actually starts,
 * so opening a track page or hovering a card never pollutes the list.
 */
export default function RecentPage() {
  useSeo({ title: "Recently Played", noindex: true });
  const navigate = useNavigate();
  const { recent, clearRecent } = useLibrary();
  const { toast } = useUI();

  const ids = useMemo(() => recent.map((entry) => entry.id), [recent]);
  const playedAt = useMemo(
    () => new Map(recent.map((entry) => [entry.id, entry.playedAt])),
    [recent]
  );

  const { data: tracks, loading, error, retry } = useAsync(
    () => getTracks(ids),
    [ids.join(",")],
    []
  );

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;

  const list = tracks || [];

  return (
    <div className="page">
      <div className="page__header-row">
        <h1 className="page__title">Recently played</h1>
        {list.length > 0 ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => { clearRecent(); toast("History cleared", { icon: "check" }); }}
          >
            Clear history
          </button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonRows count={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Nothing played yet"
          message="Tracks you listen to will show up here."
          action="Find music"
          onAction={() => navigate("/")}
        />
      ) : (
        <>
          <p className="page__note">
            Last played {formatRelativeTime(playedAt.get(list[0]?.id))}.
          </p>
          <TrackList tracks={list} contextLabel="Recently played" showAlbum />
        </>
      )}
    </div>
  );
}
