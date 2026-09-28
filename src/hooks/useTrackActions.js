import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import AddToPlaylistDialog from "../components/AddToPlaylistDialog";
import React from "react";
import { isShareable, shareLink, trackShareUrl } from "../utils/share";

/**
 * Builds the track context menu once, for every surface that shows a track:
 * list rows, cards, the player bar and the full-screen mobile player.
 *
 * Keeping this in one place is what makes "Add to queue" behave identically
 * everywhere, including the toast it raises.
 */
export function useTrackActions() {
  const { playNext, addToQueue } = usePlayer();
  const { toggleLike, isLiked } = useLibrary();
  const { openMenu, openModal, toast } = useUI();
  const navigate = useNavigate();

  const like = useCallback(
    (track) => {
      const nowLiked = toggleLike(track.id);
      toast(nowLiked ? `Added to Liked Songs` : `Removed from Liked Songs`, {
        icon: nowLiked ? "heart" : "heartOutline",
      });
      return nowLiked;
    },
    [toggleLike, toast]
  );

  const queueLast = useCallback(
    (track) => {
      addToQueue(track);
      toast("Added to queue", { icon: "queue" });
    },
    [addToQueue, toast]
  );

  const queueNext = useCallback(
    (track) => {
      playNext(track);
      toast("Playing next", { icon: "next" });
    },
    [playNext, toast]
  );

  const addToPlaylist = useCallback(
    (track) => {
      openModal({
        title: "Add to playlist",
        body: <AddToPlaylistDialog track={track} />,
      });
    },
    [openModal]
  );

  const share = useCallback(
    async (track) => {
      const message = await shareLink({
        title: track.title,
        text: `${track.title} — ${track.artists?.join(", ")}`,
        url: trackShareUrl(track),
      });
      if (message) toast(message, { icon: "share" });
    },
    [toast]
  );

  /**
   * `context` lets a surface contribute extra items — the playlist page adds
   * "Remove from this playlist", the queue panel adds "Remove from queue".
   */
  const openTrackMenu = useCallback(
    (track, anchor, context = {}) => {
      const liked = isLiked(track.id);
      const items = [
        { label: "Play next", icon: "next", onSelect: () => queueNext(track) },
        { label: "Add to queue", icon: "queue", onSelect: () => queueLast(track) },
        {
          label: "Add to playlist",
          icon: "plus",
          onSelect: () => addToPlaylist(track),
          separatorBefore: true,
        },
        {
          label: liked ? "Remove from Liked Songs" : "Save to Liked Songs",
          icon: liked ? "heart" : "heartOutline",
          onSelect: () => like(track),
        },
        isShareable(track) ? { label: "Share", icon: "share", onSelect: () => share(track) } : null,
        track.artistIds?.length
          ? {
              label: "Go to artist",
              icon: "artist",
              onSelect: () => navigate(`/artist/${track.artistIds[0]}`),
              separatorBefore: true,
            }
          : null,
        track.albumId
          ? { label: "Go to album", icon: "album", onSelect: () => navigate(`/album/${track.albumId}`) }
          : null,
        ...(context.extraItems || []),
      ];

      openMenu(items, anchor);
    },
    [isLiked, queueNext, queueLast, addToPlaylist, like, share, navigate, openMenu]
  );

  return { openTrackMenu, like, queueNext, queueLast, addToPlaylist, share };
}
