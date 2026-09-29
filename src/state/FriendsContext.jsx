import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAuth } from "./AuthContext";
import { usePlayer } from "./PlayerContext";
import { useRoom } from "./RoomContext";
import { useUI } from "./UIContext";
import {
  acceptRequest, claimUsername, clearActivity, goOnline, isRealtimeConfigured, publishActivity, publishProfile,
  removeFriend, removeRequest, sendRequest, watch,
} from "../services/friends";

/**
 * Friends: requests by email, who's online, what they're playing and which
 * room they're in. Our own presence is published from here, so it sits
 * inside RoomProvider to know the current room.
 */
const FriendsContext = createContext(null);

const HIDE_KEY = "resonate.hideActivity";
const readHidden = () => {
  try {
    return window.localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Keeps one live subscription per id in `ids` to `path(id)`, and returns
 * { [id]: value }. Subscriptions for ids that leave the list are closed.
 */
function useWatchMany(ids, path) {
  const [values, setValues] = useState({});
  const subs = useRef({});
  const key = ids.join(",");

  useEffect(() => {
    const wanted = new Set(ids);
    Object.keys(subs.current).forEach((id) => {
      if (wanted.has(id)) return;
      subs.current[id].then((off) => off());
      delete subs.current[id];
      setValues((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });
    ids.forEach((id) => {
      if (subs.current[id]) return;
      subs.current[id] = watch(path(id), (value) => setValues((prev) => ({ ...prev, [id]: value })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => {
    Object.values(subs.current).forEach((sub) => sub.then((off) => off()));
    subs.current = {};
  }, []);

  return values;
}

export function FriendsProvider({ children }) {
  const { user } = useAuth();
  const { currentTrack, isPlaying } = usePlayer();
  const { code: roomCode, isHost } = useRoom();
  const { toast } = useUI();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const enabled = isRealtimeConfigured;

  const [friendIds, setFriendIds] = useState([]);
  const [incoming, setIncoming] = useState({});
  const [sentIds, setSentIds] = useState([]);
  const [hidden, setHiddenState] = useState(readHidden);
  const [me, setMe] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Profile, online status and our lists.
  useEffect(() => {
    if (!enabled || !uid) {
      setFriendIds([]);
      setIncoming({});
      setSentIds([]);
      setMe(null);
      setProfileLoaded(false);
      return undefined;
    }
    publishProfile(user).catch(() => {});
    const offs = [
      goOnline(uid),
      watch(`profiles/${uid}`, (v) => { setMe(v); setProfileLoaded(true); }),
      watch(`friends/${uid}`, (v) => setFriendIds(Object.keys(v || {}))),
      watch(`friendRequests/${uid}`, (v) => setIncoming(v || {})),
      watch(`sentRequests/${uid}`, (v) => setSentIds(Object.keys(v || {}))),
    ];
    return () => offs.forEach((p) => p.then((off) => off()).catch(() => {}));
    // Name and photo changes republish the profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, user?.name, user?.photo, user?.email]);

  // What we're playing, for friends. Only real changes are written.
  useEffect(() => {
    if (!enabled || !uid) return;
    if (hidden) {
      clearActivity(uid).catch(() => {});
      return;
    }
    publishActivity(uid, { track: currentTrack, isPlaying, roomCode, roomHost: isHost }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, hidden, currentTrack?.id, isPlaying, roomCode, isHost]);

  // A toast for each new request that arrives while the app is open.
  const seen = useRef(null);
  useEffect(() => {
    const ids = Object.keys(incoming);
    if (seen.current) {
      ids.filter((id) => !seen.current.has(id)).forEach((id) => {
        toast(`${incoming[id]?.name || "Someone"} sent you a friend request.`, { icon: "people" });
      });
    }
    seen.current = new Set(ids);
  }, [incoming, toast]);
  useEffect(() => { seen.current = null; }, [uid]);

  const profiles = useWatchMany(friendIds, (id) => `profiles/${id}`);
  const presence = useWatchMany(friendIds, (id) => `presence/${id}`);
  const sentProfiles = useWatchMany(sentIds, (id) => `profiles/${id}`);

  const friends = useMemo(
    () => friendIds
      .map((id) => {
        const p = presence[id] || {};
        return {
          uid: id,
          name: profiles[id]?.name || "Friend",
          username: profiles[id]?.username || null,
          photo: profiles[id]?.photo || null,
          online: Boolean(p.connections && Object.keys(p.connections).length),
          lastSeen: p.lastSeen || null,
          track: p.track || null,
          isPlaying: Boolean(p.isPlaying),
          roomCode: p.roomCode || null,
          roomHost: Boolean(p.roomHost),
        };
      })
      .sort((a, b) => (b.online - a.online) || (b.isPlaying - a.isPlaying) || a.name.localeCompare(b.name)),
    [friendIds, presence, profiles]
  );

  const requests = useMemo(
    () => Object.entries(incoming)
      .map(([id, r]) => ({ uid: id, name: r?.name || "Someone", photo: r?.photo || null, at: r?.at || 0 }))
      .sort((a, b) => b.at - a.at),
    [incoming]
  );

  const sent = useMemo(
    () => sentIds.map((id) => ({ uid: id, name: sentProfiles[id]?.name || "Pending", photo: sentProfiles[id]?.photo || null })),
    [sentIds, sentProfiles]
  );

  const add = useCallback(async (email) => {
    if (!uid) throw new Error("Sign in with an account to add friends.");
    return sendRequest(user, email);
  }, [uid, user]);
  const accept = useCallback((fromUid) => acceptRequest(uid, fromUid), [uid]);
  const decline = useCallback((fromUid) => removeRequest(uid, fromUid), [uid]);
  const cancel = useCallback((toUid) => removeRequest(toUid, uid), [uid]);
  const remove = useCallback((friendUid) => removeFriend(uid, friendUid), [uid]);
  const username = me?.username || null;
  const setUsername = useCallback((next) => claimUsername(uid, next, username), [uid, username]);

  const setHidden = useCallback((next) => {
    setHiddenState(next);
    try {
      window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      signedIn: Boolean(uid),
      uid,
      profileLoaded,
      friends,
      requests,
      sent,
      onlineCount: friends.filter((f) => f.online).length,
      hidden,
      setHidden,
      username,
      setUsername,
      add, accept, decline, cancel, remove,
    }),
    [enabled, uid, profileLoaded, friends, requests, sent, hidden, setHidden, username, setUsername, add, accept, decline, cancel, remove]
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends() {
  const context = useContext(FriendsContext);
  if (!context) throw new Error("useFriends must be used inside a FriendsProvider.");
  return context;
}
