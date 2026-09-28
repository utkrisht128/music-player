import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from "../utils/storage";
import { db } from "../services/firebase";
import { exportYouTubeTracks, importYouTubeTracks } from "../services/youtube";
import {
  changeSharedTracks,
  createSharedPlaylist,
  deleteSharedPlaylist,
  joinSharedPlaylist,
  leaveSharedPlaylist,
  removeSharedMember,
  subscribeSharedPlaylists,
  updateSharedDetails,
  describeError,
  logError,
} from "../services/sharedPlaylists";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";

/**
 * The listener's own library: playlists, liked tracks and play history.
 *
 * Only track IDS are stored, never whole track objects. Persisting a full
 * track would freeze a copy of its metadata (and its bundled file URL, which
 * changes hash on every build) into localStorage; ids stay valid and are
 * re-resolved through MusicService on read.
 *
 * Signed in, the library is also kept in Firestore at users/{uid} and synced
 * live between devices (see the cloud sync section below).
 *
 * Shared playlists (services/sharedPlaylists.js) live in their own documents
 * and are merged into `playlists` with `shared: true`; the playlist actions
 * below route edits to Firestore for those.
 */

const LibraryContext = createContext(null);

const MAX_RECENT = 50;

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Defensive load: a hand-edited or half-written localStorage value must not crash boot. */
function cleanPlaylists(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: typeof p.description === "string" ? p.description : "",
      artwork: typeof p.artwork === "string" ? p.artwork : null,
      trackIds: Array.isArray(p.trackIds) ? p.trackIds.filter((id) => typeof id === "string") : [],
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    }));
}

function cleanEntries(raw) {
  return Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry.id === "string") : [];
}

const loadPlaylists = () => cleanPlaylists(readJSON(STORAGE_KEYS.playlists, []));
const loadLiked = () => cleanEntries(readJSON(STORAGE_KEYS.liked, []));
const loadRecent = () => cleanEntries(readJSON(STORAGE_KEYS.recent, []));

// ---------------------------------------------------------- cloud sync helpers

const serialize = (lib) => JSON.stringify([lib.playlists, lib.liked, lib.recent]);

/** Union by id, keeping the entry with the newest `stamp`; newest first. */
function unionBy(a, b, stamp) {
  const byId = new Map();
  [...a, ...b].forEach((entry) => {
    const have = byId.get(entry.id);
    if (!have || (Number(entry[stamp]) || 0) > (Number(have[stamp]) || 0)) byId.set(entry.id, entry);
  });
  return [...byId.values()].sort((x, y) => (Number(y[stamp]) || 0) - (Number(x[stamp]) || 0));
}

/** First sign-in on a device: nothing on either side is lost. */
function mergeLibraries(local, remote) {
  return {
    playlists: unionBy(local.playlists, remote.playlists, "updatedAt").sort((x, y) => y.createdAt - x.createdAt),
    liked: unionBy(local.liked, remote.liked, "likedAt"),
    recent: unionBy(local.recent, remote.recent, "playedAt").slice(0, MAX_RECENT),
  };
}

function fromRemote(data) {
  return {
    playlists: cleanPlaylists(data.playlists || []),
    liked: cleanEntries(data.liked || []),
    recent: cleanEntries(data.recent || []),
  };
}

/** Every track id the library refers to. */
const referencedIds = (lib) => [
  ...new Set([...lib.playlists.flatMap((p) => p.trackIds), ...lib.liked.map((e) => e.id), ...lib.recent.map((e) => e.id)]),
];

/** Log a failed shared-playlist call, then reject with a readable message. */
const rethrow = (promise, action, playlistId, fallback) =>
  promise.catch((error) => {
    logError(action, error, { playlistId });
    throw new Error(describeError(error, fallback));
  });

/** Firestore rejects `undefined`; a JSON round-trip drops it. */
const toFirestore = (lib) => JSON.parse(JSON.stringify(lib));

export function LibraryProvider({ children }) {
  const [playlists, setPlaylists] = useState(loadPlaylists);
  const [liked, setLiked] = useState(loadLiked);
  const [recent, setRecent] = useState(loadRecent);

  useEffect(() => { writeJSON(STORAGE_KEYS.playlists, playlists); }, [playlists]);
  useEffect(() => { writeJSON(STORAGE_KEYS.liked, liked); }, [liked]);
  useEffect(() => { writeJSON(STORAGE_KEYS.recent, recent); }, [recent]);

  // ------------------------------------------------------------ cloud sync
  /*
   * users/{uid} holds { playlists, liked, recent }.
   * - First sign-in on a device merges the device library into the account.
   * - After that the device is "linked" and the account is the source of
   *   truth: remote changes replace local state, local edits are pushed.
   * - Signing out clears the library from the device.
   */
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [syncStatus, setSyncStatus] = useState("off"); // off | syncing | synced | offline
  const libRef = useRef(null);
  libRef.current = { playlists, liked, recent };
  const remoteRef = useRef(null); // serialized state last known to match the server
  const readyRef = useRef(false);
  const pushTimer = useRef(null);
  const remoteTracks = useRef({}); // track details last seen on the server
  const prevUid = useRef(uid);

  const applyLibrary = useCallback((lib) => {
    setPlaylists(lib.playlists);
    setLiked(lib.liked);
    setRecent(lib.recent);
  }, []);

  const push = useCallback(
    (lib) => {
      if (!uid || !db) return;
      remoteRef.current = serialize(lib);
      // Song details travel with the ids so other devices can show them.
      // Details this device never had are carried over from the server copy.
      const ids = referencedIds(lib);
      const known = exportYouTubeTracks(ids);
      const tracks = {};
      ids.forEach((id) => {
        const track = known[id] || remoteTracks.current[id];
        if (track) tracks[id] = track;
      });
      remoteTracks.current = tracks;
      setDoc(doc(db, "users", uid), { ...toFirestore(lib), tracks: toFirestore(tracks), updatedAt: serverTimestamp() })
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("offline"));
    },
    [uid]
  );

  useEffect(() => {
    // Signed out, or switched account: wipe this device's copy.
    if (prevUid.current && prevUid.current !== uid) {
      applyLibrary({ playlists: [], liked: [], recent: [] });
      removeKey(STORAGE_KEYS.syncedUid);
    }
    prevUid.current = uid;
    readyRef.current = false;
    remoteRef.current = null;
    if (!uid || !db) {
      setSyncStatus("off");
      return undefined;
    }

    setSyncStatus("syncing");
    let first = true;
    const unsubscribe = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const remote = snap.exists() ? fromRemote(snap.data()) : null;
        if (snap.exists()) {
          const tracks = snap.data().tracks;
          if (tracks && typeof tracks === "object") {
            remoteTracks.current = tracks;
            importYouTubeTracks(tracks);
          }
        }

        if (first) {
          first = false;
          const linked = readJSON(STORAGE_KEYS.syncedUid, null) === uid;
          const local = libRef.current;
          const next = !remote ? local : linked ? remote : mergeLibraries(local, remote);
          writeJSON(STORAGE_KEYS.syncedUid, uid);
          applyLibrary(next);
          readyRef.current = true;
          // Also push when this device knows songs the server has no details for
          // (libraries saved before details were synced).
          const missingDetails = Object.keys(exportYouTubeTracks(referencedIds(next))).some(
            (id) => !remoteTracks.current[id]
          );
          if (!remote || missingDetails || serialize(next) !== serialize(remote)) push(next);
          else remoteRef.current = serialize(remote);
          setSyncStatus(snap.metadata.fromCache ? "offline" : "synced");
          return;
        }

        // Echo of our own write, or a local edit is about to be pushed: skip.
        if (!remote || snap.metadata.hasPendingWrites || pushTimer.current) return;
        remoteRef.current = serialize(remote);
        applyLibrary(remote);
        setSyncStatus("synced");
      },
      () => setSyncStatus("offline")
    );
    return () => {
      unsubscribe();
      clearTimeout(pushTimer.current);
      pushTimer.current = null;
    };
  }, [uid, applyLibrary, push]);

  // Push local edits (debounced) once the first sync has settled.
  useEffect(() => {
    if (!uid || !readyRef.current) return;
    if (serialize({ playlists, liked, recent }) === remoteRef.current) return;
    clearTimeout(pushTimer.current);
    setSyncStatus("syncing");
    pushTimer.current = setTimeout(() => {
      pushTimer.current = null;
      push(libRef.current);
    }, 600);
  }, [uid, playlists, liked, recent, push]);

  // ------------------------------------------------------- shared playlists
  const [shared, setShared] = useState([]);
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const isShared = useCallback((id) => sharedRef.current.some((p) => p.id === id), []);
  const { toast } = useUI();
  /** Edits are fire-and-forget, so failures are logged and shown here. */
  const failed = useCallback(
    (action, playlistId) => (error) => {
      logError(action, error, { playlistId });
      toast(describeError(error), { tone: "error", icon: "warning" });
    },
    [toast]
  );

  useEffect(() => {
    setShared([]);
    if (!uid || !db) return undefined;
    return subscribeSharedPlaylists(uid, setShared, (error) => {
      logError("subscribe", error, { uid });
      toast("Couldn't load your shared playlists.", { tone: "error", icon: "warning" });
    });
  }, [uid, toast]);

  const allPlaylists = useMemo(
    () => [...shared, ...playlists].sort((x, y) => y.createdAt - x.createdAt),
    [shared, playlists]
  );

  /** Turn one of your playlists into a shared one. Resolves to its new id. */
  const sharePlaylist = useCallback(
    async (id) => {
      if (!user || !db) throw new Error("Sign in to share playlists.");
      if (isShared(id)) return id;
      const playlist = libRef.current.playlists.find((p) => p.id === id);
      if (!playlist) throw new Error("Playlist not found.");
      let sharedId;
      try {
        sharedId = await createSharedPlaylist(user, playlist);
      } catch (error) {
        logError("share", error, { playlistId: id });
        throw new Error(describeError(error, "Couldn't share the playlist."));
      }
      setPlaylists((current) => current.filter((p) => p.id !== id));
      return sharedId;
    },
    [user, isShared]
  );

  const joinPlaylist = useCallback(
    (id) => {
      if (!user || !db) return Promise.reject(new Error("Sign in to join playlists."));
      return rethrow(joinSharedPlaylist(id, user), "join", id, "Couldn't join the playlist.");
    },
    [user]
  );

  const leavePlaylist = useCallback(
    (id) => (uid ? rethrow(leaveSharedPlaylist(id, uid), "leave", id, "Couldn't leave the playlist.") : Promise.resolve()),
    [uid]
  );

  const removeMember = useCallback(
    (id, memberUid) => rethrow(removeSharedMember(id, memberUid), "removeMember", id, "Couldn't remove that member."),
    []
  );

  // Fast membership test for the heart on every row.
  const likedIds = useMemo(() => new Set(liked.map((entry) => entry.id)), [liked]);

  // -------------------------------------------------------------- playlists
  const createPlaylist = useCallback(({ name, description = "", artwork = null, trackIds = [] } = {}) => {
    const playlist = {
      id: createId("pl"),
      name: (name || "").trim() || "New Playlist",
      description: description.trim(),
      artwork,
      trackIds: [...trackIds],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPlaylists((current) => [playlist, ...current]);
    return playlist;
  }, []);

  const updatePlaylist = useCallback((id, patch) => {
    if (isShared(id)) {
      updateSharedDetails(id, patch).catch(failed("updateDetails", id));
      return;
    }
    setPlaylists((current) =>
      current.map((playlist) =>
        playlist.id === id ? { ...playlist, ...patch, updatedAt: Date.now() } : playlist
      )
    );
  }, [isShared, failed]);

  /** Deleting a shared playlist deletes it for everyone (owner only). */
  const deletePlaylist = useCallback((id) => {
    if (isShared(id)) {
      deleteSharedPlaylist(id).catch(failed("delete", id));
      return;
    }
    setPlaylists((current) => current.filter((playlist) => playlist.id !== id));
  }, [isShared, failed]);

  /** Returns false when the track is already present, so the UI can say so. */
  const addToPlaylist = useCallback((playlistId, trackId) => {
    const sharedPlaylist = sharedRef.current.find((p) => p.id === playlistId);
    if (sharedPlaylist) {
      if (sharedPlaylist.trackIds.includes(trackId)) return false;
      changeSharedTracks(playlistId, (ids) => (ids.includes(trackId) ? null : [...ids, trackId])).catch(failed("addTrack", playlistId));
      return true;
    }
    let added = false;
    setPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId || playlist.trackIds.includes(trackId)) return playlist;
        added = true;
        return { ...playlist, trackIds: [...playlist.trackIds, trackId], updatedAt: Date.now() };
      })
    );
    return added;
  }, [failed]);

  /**
   * Removes by position, not by id: a playlist may legitimately contain the
   * same track twice, and removing "the track" would drop both.
   */
  const removeFromPlaylistAt = useCallback((playlistId, index) => {
    if (isShared(playlistId)) {
      // Check the id at that position so a concurrent edit is not undone.
      const expected = sharedRef.current.find((p) => p.id === playlistId)?.trackIds[index];
      changeSharedTracks(playlistId, (ids) =>
        ids[index] === expected ? ids.filter((_, i) => i !== index) : null
      ).catch(failed("removeTrack", playlistId));
      return;
    }
    setPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const trackIds = playlist.trackIds.filter((_, i) => i !== index);
        return { ...playlist, trackIds, updatedAt: Date.now() };
      })
    );
  }, [isShared, failed]);

  const reorderPlaylist = useCallback((playlistId, from, to) => {
    if (isShared(playlistId)) {
      changeSharedTracks(playlistId, (ids) => {
        const trackIds = [...ids];
        const [moved] = trackIds.splice(from, 1);
        if (moved === undefined) return null;
        trackIds.splice(to, 0, moved);
        return trackIds;
      }).catch(failed("reorder", playlistId));
      return;
    }
    setPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const trackIds = [...playlist.trackIds];
        const [moved] = trackIds.splice(from, 1);
        if (moved === undefined) return playlist;
        trackIds.splice(to, 0, moved);
        return { ...playlist, trackIds, updatedAt: Date.now() };
      })
    );
  }, [isShared, failed]);

  const getPlaylist = useCallback(
    (id) => allPlaylists.find((playlist) => playlist.id === id) || null,
    [allPlaylists]
  );

  // ------------------------------------------------------------------ likes
  const isLiked = useCallback((trackId) => likedIds.has(trackId), [likedIds]);

  /** Returns the resulting state so the caller can word its toast correctly. */
  const toggleLike = useCallback((trackId) => {
    let nowLiked = false;
    setLiked((current) => {
      const exists = current.some((entry) => entry.id === trackId);
      nowLiked = !exists;
      return exists
        ? current.filter((entry) => entry.id !== trackId)
        : [{ id: trackId, likedAt: Date.now() }, ...current];
    });
    return nowLiked;
  }, []);

  const unlike = useCallback((trackId) => {
    setLiked((current) => current.filter((entry) => entry.id !== trackId));
  }, []);

  // -------------------------------------------------------------- history
  /**
   * Called when playback actually starts, not when a track is selected.
   * Re-playing a track moves it to the top rather than adding a duplicate.
   */
  const recordPlay = useCallback((trackId) => {
    if (!trackId) return;
    setRecent((current) => {
      const withoutTrack = current.filter((entry) => entry.id !== trackId);
      return [{ id: trackId, playedAt: Date.now() }, ...withoutTrack].slice(0, MAX_RECENT);
    });
  }, []);

  const clearRecent = useCallback(() => setRecent([]), []);

  const value = useMemo(
    () => ({
      playlists: allPlaylists,
      getPlaylist,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylistAt,
      reorderPlaylist,
      sharePlaylist,
      joinPlaylist,
      leavePlaylist,
      removeMember,
      liked,
      likedIds,
      isLiked,
      toggleLike,
      unlike,
      recent,
      recordPlay,
      clearRecent,
      syncStatus,
    }),
    [
      allPlaylists, getPlaylist, createPlaylist, updatePlaylist, deletePlaylist,
      addToPlaylist, removeFromPlaylistAt, reorderPlaylist,
      sharePlaylist, joinPlaylist, leavePlaylist, removeMember,
      liked, likedIds, isLiked, toggleLike, unlike,
      recent, recordPlay, clearRecent, syncStatus,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside a LibraryProvider.");
  return context;
}
