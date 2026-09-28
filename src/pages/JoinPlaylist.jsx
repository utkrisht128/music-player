import React, { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import TrackList from "../components/TrackList";
import Icon from "../components/Icon";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import SignInDialog from "../components/SignInDialog";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useAuth } from "../state/AuthContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getTracks } from "../services/musicService";
import { describeError, getSharedPlaylist, logError } from "../services/sharedPlaylists";
import { useSeo } from "../hooks/useSeo";

/** Invite link for a shared playlist (/join/:id): preview, then join. */
export default function JoinPlaylistPage() {
  useSeo({ title: "Join playlist", noindex: true });
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, ready, enabled } = useAuth();
  const { getPlaylist, joinPlaylist } = useLibrary();
  const { playTracks } = usePlayer();
  const { openModal, toast } = useUI();
  const [joining, setJoining] = useState(false);
  const alreadyMember = Boolean(getPlaylist(id));

  // Reading a shared playlist needs an account, so wait for sign-in.
  const { data, loading, error, retry } = useAsync(async () => {
    if (!user) return null;
    let playlist;
    try {
      playlist = await getSharedPlaylist(id);
    } catch (e) {
      logError("preview", e, { playlistId: id });
      throw new Error(describeError(e, "Couldn't open this invite."));
    }
    if (!playlist) return { playlist: null, tracks: [] };
    return { playlist, tracks: await getTracks(playlist.trackIds) };
  }, [id, user?.uid]);

  if (alreadyMember) return <Navigate to={`/playlist/${id}`} replace />;

  if (!enabled) {
    return <div className="page"><EmptyState icon="people" title="Accounts are off" message="Shared playlists need accounts, which are not set up on this site." /></div>;
  }

  if (ready && !user) {
    return (
      <div className="page">
        <EmptyState
          icon="people"
          title="You've been invited to a playlist"
          message="Sign in to see it and add songs together."
          action="Sign in"
          onAction={() => openModal({ title: "Sign in", bare: true, body: <SignInDialog /> })}
        />
      </div>
    );
  }

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (!ready || loading || !data) return <div className="page"><SkeletonRows count={8} /></div>;
  if (!data.playlist) {
    return (
      <div className="page">
        <EmptyState icon="library" title="Playlist not found" message="The owner may have deleted it." action="Back to library" onAction={() => navigate("/library")} />
      </div>
    );
  }

  const { playlist, tracks } = data;
  const owner = playlist.memberInfo[playlist.ownerUid]?.name || "Someone";

  const join = async () => {
    setJoining(true);
    try {
      await joinPlaylist(id);
      toast(`Joined ${playlist.name}`, { icon: "check" });
      navigate(`/playlist/${id}`, { replace: true });
    } catch (e) {
      setJoining(false);
      toast(e.message || "Could not join the playlist", { tone: "error", icon: "warning" });
    }
  };

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind={`Shared by ${owner} · ${playlist.members.length} ${playlist.members.length === 1 ? "member" : "members"}`}
        title={playlist.name}
        description={playlist.description}
        artwork={playlist.artwork || tracks[0]?.artwork}
        tracks={tracks}
        onPlay={() => playTracks(tracks, 0, playlist.name)}
        actions={
          <button type="button" className="btn btn--primary" onClick={join} disabled={joining}>
            <Icon name="people" size={16} />
            <span>{joining ? "Joining…" : "Join playlist"}</span>
          </button>
        }
      />
      {tracks.length ? <TrackList tracks={tracks} contextLabel={playlist.name} showAlbum /> : null}
    </div>
  );
}
