import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import CollectionHeader from "../components/CollectionHeader";
import { playlistShareUrl, shareLink } from "../utils/share";
import TrackList from "../components/TrackList";
import Icon from "../components/Icon";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getCuratedPlaylist, getTracks } from "../services/musicService";
import PlaylistEditDialog from "../components/PlaylistEditDialog";
import { useSeo } from "../hooks/useSeo";
import { useAuth } from "../state/AuthContext";
import { joinUrl } from "../services/sharedPlaylists";

/**
 * One page serves both kinds of playlist:
 *  - user playlists (editable, from LibraryContext)
 *  - shared playlists (editable by every member, synced live)
 *  - curated shelves (read-only, from the provider)
 * A curated playlist deliberately offers no rename/delete, because those
 * would be meaningless against catalogue data.
 */
export default function PlaylistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { playTracks, shufflePlay, togglePlay, currentTrack } = usePlayer();
  const { getPlaylist, deletePlaylist, removeFromPlaylistAt, sharePlaylist: makeShared, leavePlaylist } = useLibrary();
  const { openModal, toast } = useUI();
  const { user, enabled: accountsEnabled } = useAuth();

  const userPlaylist = getPlaylist(id);
  const trackIdsKey = userPlaylist ? userPlaylist.trackIds.join(",") : "";

  const { data, loading, error, retry } = useAsync(async () => {
    if (userPlaylist) return { tracks: await getTracks(userPlaylist.trackIds), curated: null };
    const curated = await getCuratedPlaylist(id);
    if (!curated) return null;
    return { tracks: await getTracks(curated.trackIds), curated };
  }, [id, trackIdsKey, Boolean(userPlaylist)]);
  const seoTitle = data?.curated ? data.curated.title : userPlaylist?.name;
  useSeo({
    title: seoTitle,
    description: data?.curated?.description || (seoTitle ? `Listen to the ${seoTitle} playlist on Resonate.` : undefined),
    image: data?.curated?.artwork,
    noindex: !data?.curated,
  });

  if (error) return <div className="page"><ErrorState message={error.message} onRetry={retry} /></div>;
  if (loading) return <div className="page"><SkeletonRows count={8} /></div>;
  if (!data) {
    return (
      <div className="page">
        <EmptyState
          icon="library"
          title="Playlist not found"
          message="It may have been deleted."
          action="Back to library"
          onAction={() => navigate("/library")}
        />
      </div>
    );
  }

  const { tracks, curated } = data;
  const title = curated ? curated.title : userPlaylist.name;
  const description = curated ? curated.description : userPlaylist.description;
  // A user playlist shows the artwork of its first track until one is set.
  const artwork = curated ? curated.artwork : userPlaylist.artwork || tracks[0]?.artwork;
  const playingHere = tracks.some((track) => track.id === currentTrack?.id);

  const isShared = Boolean(userPlaylist?.shared);
  const isOwner = isShared && userPlaylist.ownerUid === user?.uid;

  const invite = async () => {
    if (!user) {
      toast("Sign in to share playlists with friends", { icon: "people" });
      return;
    }
    try {
      const sharedId = isShared ? userPlaylist.id : await makeShared(userPlaylist.id);
      if (sharedId !== userPlaylist.id) navigate(`/playlist/${sharedId}`, { replace: true });
      const message = await shareLink({
        title,
        text: `Join my playlist "${title}" on Resonate`,
        url: joinUrl(sharedId),
      });
      toast(message ? "Invite link copied. Anyone who joins can add songs." : "Playlist shared", { icon: "people" });
    } catch (e) {
      toast(e.message || "Could not share the playlist", { tone: "error", icon: "warning" });
    }
  };

  const showMembers = () => {
    openModal({ title: "Members", body: <Members playlist={userPlaylist} onInvite={invite} /> });
  };

  const leave = () => {
    leavePlaylist(userPlaylist.id)
      .then(() => {
        toast(`Left ${userPlaylist.name}`, { icon: "check" });
        navigate("/library");
      })
      .catch((e) => toast(e.message, { tone: "error", icon: "warning" }));
  };

  const remove = () => {
    deletePlaylist(userPlaylist.id);
    toast(`Deleted ${userPlaylist.name}`, { icon: "trash" });
    navigate("/library");
  };

  const confirmDelete = () => {
    openModal({
      title: "Delete playlist?",
      body: <ConfirmDelete name={userPlaylist.name} shared={isShared} onConfirm={remove} />,
    });
  };

  const sharePlaylist = async () => {
    const message = await shareLink({
      title,
      text: `${title} — a playlist on Resonate`,
      url: playlistShareUrl(title, tracks.map((t) => t.id)),
    });
    if (message) toast(message, { icon: "share" });
  };

  const edit = () => {
    openModal({ title: "Edit details", body: <PlaylistEditDialog playlist={userPlaylist} /> });
  };

  return (
    <div className="page page--collection">
      <CollectionHeader
        kind={curated ? "Curated playlist" : isShared ? `Shared playlist · ${userPlaylist.members.length} ${userPlaylist.members.length === 1 ? "member" : "members"}` : "Playlist"}
        title={title}
        description={description}
        artwork={artwork}
        tracks={tracks}
        onPlay={() => (playingHere ? togglePlay() : playTracks(tracks, 0, title))}
        onShuffle={() => shufflePlay(tracks, title)}
        actions={
          <>
            {tracks.length > 0 ? (
              <button type="button" className="icon-btn" onClick={sharePlaylist} aria-label="Share playlist" title="Share">
                <Icon name="share" size={18} />
              </button>
            ) : null}
            {curated ? null : (
            <>
              {accountsEnabled ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={isShared ? showMembers : invite}
                  aria-label={isShared ? "Members" : "Invite friends"}
                  title={isShared ? "Members" : "Invite friends to edit together"}
                >
                  <Icon name="people" size={18} />
                </button>
              ) : null}
              <button type="button" className="icon-btn" onClick={edit} aria-label="Edit details">
                <Icon name="edit" size={18} />
              </button>
              {isShared && !isOwner ? (
                <button type="button" className="btn btn--ghost" onClick={leave}>
                  Leave
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={confirmDelete}
                  aria-label="Delete playlist"
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </>
            )}
          </>
        }
      />

      {tracks.length === 0 ? (
        <EmptyState
          icon="music"
          title="This playlist is empty"
          message="Find something you like and add it with the ⋮ menu."
          action="Find music"
          onAction={() => navigate("/search")}
        />
      ) : (
        <TrackList
          tracks={tracks}
          contextLabel={title}
          showAlbum
          menuContextFor={
            curated
              ? undefined
              : (track, index) => ({
                  extraItems: [
                    {
                      label: "Remove from this playlist",
                      icon: "trash",
                      danger: true,
                      separatorBefore: true,
                      onSelect: () => {
                        removeFromPlaylistAt(userPlaylist.id, index);
                        toast(`Removed from ${title}`, { icon: "check" });
                      },
                    },
                  ],
                })
          }
        />
      )}
    </div>
  );
}

function Members({ playlist, onInvite }) {
  const { closeModal, toast } = useUI();
  const { user } = useAuth();
  const { removeMember } = useLibrary();
  const isOwner = playlist.ownerUid === user?.uid;
  return (
    <div className="members">
      <ul className="members__list">
        {playlist.members.map((uid) => {
          const info = playlist.memberInfo[uid] || {};
          return (
            <li key={uid} className="members__row">
              {info.photo ? (
                <img className="members__avatar" src={info.photo} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="members__avatar members__avatar--blank">{(info.name || "?").charAt(0).toUpperCase()}</span>
              )}
              <span className="members__name">
                {info.name || "Listener"}
                {uid === user?.uid ? " (you)" : ""}
                {uid === playlist.ownerUid ? <small> · Owner</small> : null}
              </span>
              {isOwner && uid !== user?.uid ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${info.name || "member"}`}
                  onClick={() =>
                    removeMember(playlist.id, uid)
                      .then(() => toast("Member removed", { icon: "check" }))
                      .catch((e) => toast(e.message, { tone: "error", icon: "warning" }))
                  }
                >
                  <Icon name="close" size={16} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="confirm__actions">
        <button type="button" className="btn btn--subtle" onClick={closeModal}>
          Done
        </button>
        <button type="button" className="btn btn--primary" onClick={() => { closeModal(); onInvite(); }}>
          Copy invite link
        </button>
      </div>
    </div>
  );
}

function ConfirmDelete({ name, shared, onConfirm }) {
  const { closeModal } = useUI();
  return (
    <div className="confirm">
      <p className="confirm__text">
        This will permanently delete <strong>{name}</strong>
        {shared ? " for every member" : ""}. This cannot be undone.
      </p>
      <div className="confirm__actions">
        <button type="button" className="btn btn--subtle" onClick={closeModal}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => { closeModal(); onConfirm(); }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
