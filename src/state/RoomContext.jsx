import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { usePlayer } from "./PlayerContext";
import { useAuth } from "./AuthContext";
import { useUI } from "./UIContext";
import { getTrack } from "../services/musicService";
import {
  createRoom, endRoom, expectedPosition, isRealtimeConfigured, joinRoom, publishState, rememberRoomTrack,
  setRoomVisibility, trackSnapshot, VISIBILITY,
} from "../services/rooms";
import { track as trackEvent } from "../services/analytics";

/**
 * Listen Together: one host drives playback, everyone else follows.
 *
 * Listeners apply the host's state once per change (track, play/pause, seek)
 * and then only correct drift while both sides are playing, so a listener
 * can still pause locally without a tug-of-war with the host.
 */

const RoomContext = createContext(null);

const DRIFT_SECONDS = 2.5;
const SEEK_COOLDOWN_MS = 4000;
const LABEL = "Listen Together";

export function RoomProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useUI();
  const {
    currentTrack, isPlaying, currentTime, duration, playTracks, togglePlay, seek, manager,
  } = usePlayer();

  const [code, setCode] = useState(null);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [joining, setJoining] = useState(false);
  const leaveRef = useRef(null);

  const reset = useCallback(() => {
    leaveRef.current = null;
    setCode(null);
    setRoom(null);
    setIsHost(false);
  }, []);

  const leave = useCallback(async () => {
    const leaveFn = leaveRef.current;
    reset();
    if (leaveFn) await leaveFn();
  }, [reset]);

  const join = useCallback(async (roomCode) => {
    if (!user) throw new Error("Sign in to listen together.");
    if (leaveRef.current && code === roomCode) return true;
    await leave();
    setJoining(true);
    try {
      const leaveFn = await joinRoom(roomCode, user, (value) => {
        if (value) {
          setRoom(value);
        } else if (leaveRef.current === leaveFn) {
          toast("The host ended the session.", { icon: "people" });
          leaveFn();
          reset();
        }
      }, () => {
        toast("You no longer have access to this room.", { tone: "error", icon: "warning" });
        if (leaveRef.current === leaveFn) {
          leaveFn();
          reset();
        }
      });
      if (!leaveFn) return false;
      leaveRef.current = leaveFn;
      setIsHost(leaveFn.isHost);
      setCode(roomCode);
      trackEvent(leaveFn.isHost ? "room_rejoin_host" : "room_join", { room_code: roomCode });
      return true;
    } finally {
      setJoining(false);
    }
  }, [user, code, leave, reset, toast]);

  const create = useCallback(async (visibility = VISIBILITY.PUBLIC) => {
    if (!user) throw new Error("Sign in to listen together.");
    const roomCode = await createRoom(user, visibility);
    trackEvent("room_create", { visibility });
    await join(roomCode);
    return roomCode;
  }, [user, join]);

  const visibility = room?.visibility || VISIBILITY.PUBLIC;
  const setVisibility = useCallback(async (next) => {
    if (!code || !isHost) return;
    await setRoomVisibility(code, next);
  }, [code, isHost]);

  const end = useCallback(async () => {
    const roomCode = code;
    await leave();
    if (roomCode) await endRoom(roomCode);
  }, [code, leave]);

  // Signing out leaves the room.
  useEffect(() => {
    if (!user && leaveRef.current) leave();
  }, [user, leave]);

  // Leaving the site: best effort; onDisconnect covers the rest.
  useEffect(() => () => { leaveRef.current?.(); }, []);

  // ------------------------------------------------------------- host side
  const published = useRef(null);
  const publish = useCallback((position) => {
    if (!code) return;
    const shareable = currentTrack && currentTrack.source !== "device";
    const state = {
      trackId: shareable ? currentTrack.id : "",
      track: shareable ? trackSnapshot(currentTrack) : null,
      isPlaying: Boolean(shareable && isPlaying),
      position: Math.max(0, position || 0),
    };
    published.current = { ...state, at: Date.now() };
    publishState(code, state).catch(() => {});
  }, [code, currentTrack, isPlaying]);

  // Track change or play/pause.
  useEffect(() => {
    if (!isHost || !code) return;
    if (currentTrack?.source === "device") {
      toast("Songs from your device can't be shared in a room.", { icon: "warning" });
    }
    publish(currentTime);
    // Only these changes are worth a write; seeks are caught below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, code, currentTrack?.id, isPlaying]);

  // Seeks: the position jumped away from where it should be.
  useEffect(() => {
    const last = published.current;
    if (!isHost || !code || !last || last.trackId !== currentTrack?.id) return;
    const expected = last.isPlaying ? last.position + (Date.now() - last.at) / 1000 : last.position;
    if (Math.abs(currentTime - expected) > 3) publish(currentTime);
  }, [isHost, code, currentTime, currentTrack?.id, publish]);

  // ---------------------------------------------------------- listener side
  const state = room?.state;
  const stateKey = !isHost && state ? `${state.trackId}|${state.isPlaying}|${state.position}|${state.updatedAt}` : null;
  const applied = useRef(null);
  const loadingTrack = useRef(null);
  const lastSeek = useRef(0);
  const serverNow = () => (leaveRef.current?.serverNow ? leaveRef.current.serverNow() : Date.now());

  // Load the host's song when it changes.
  useEffect(() => {
    if (!stateKey || !state.trackId || state.trackId === currentTrack?.id) return;
    if (loadingTrack.current === state.trackId) return;
    loadingTrack.current = state.trackId;
    rememberRoomTrack(state.track);
    getTrack(state.trackId)
      .then((next) => {
        if (next) playTracks([next], 0, LABEL);
        else toast("Couldn't load the host's song.", { tone: "error" });
      })
      .catch(() => toast("Couldn't load the host's song.", { tone: "error" }))
      .finally(() => { loadingTrack.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, currentTrack?.id]);

  // Once the song is loaded, match play/pause once per change. Position is
  // matched separately below, because YouTube only reports a duration after
  // playback starts.
  const pendingSeek = useRef(null);
  useEffect(() => {
    if (!stateKey || applied.current === stateKey) return;
    if (!state.trackId) {
      applied.current = stateKey;
      return;
    }
    if (state.trackId !== currentTrack?.id) return;
    applied.current = stateKey;
    pendingSeek.current = stateKey;
    if (Boolean(state.isPlaying) !== isPlaying) togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, currentTrack?.id]);

  useEffect(() => {
    if (!stateKey || pendingSeek.current !== stateKey || state.trackId !== currentTrack?.id || !duration) return;
    pendingSeek.current = null;
    const target = Math.min(expectedPosition(state, serverNow()), Math.max(0, duration - 1));
    if (Math.abs(currentTime - target) > 1) {
      seek(target);
      lastSeek.current = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, currentTrack?.id, duration, isPlaying]);

  // Browsers block audio started by a network message rather than a click,
  // so listeners get a button that starts playback from a real gesture.
  const needsTap = Boolean(
    !isHost && state?.isPlaying && state.trackId && (currentTrack?.id !== state.trackId || !isPlaying || !duration)
  );

  const sync = useCallback(async () => {
    if (!state?.trackId) return;
    applied.current = stateKey;
    pendingSeek.current = stateKey;
    if (state.trackId !== currentTrack?.id) {
      rememberRoomTrack(state.track);
      const next = await getTrack(state.trackId).catch(() => null);
      if (next) playTracks([next], 0, LABEL);
      else toast("Couldn't load the host's song.", { tone: "error" });
    } else if (!isPlaying) {
      togglePlay();
    } else {
      // Marked as playing but the browser never let it start: this click is
      // the gesture it was waiting for.
      manager.play();
    }
  }, [state, stateKey, currentTrack?.id, isPlaying, playTracks, togglePlay, toast, manager]);

  // Drift correction while both are playing (buffering, slow devices).
  useEffect(() => {
    if (!stateKey || applied.current !== stateKey || !state.isPlaying || !isPlaying) return;
    if (state.trackId !== currentTrack?.id || !duration) return;
    if (Date.now() - lastSeek.current < SEEK_COOLDOWN_MS) return;
    const target = expectedPosition(state, serverNow());
    if (target < duration - 2 && Math.abs(currentTime - target) > DRIFT_SECONDS) {
      seek(target);
      lastSeek.current = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  const members = useMemo(
    () => Object.entries(room?.members || {})
      .map(([uid, info]) => ({ uid, ...info, isHost: uid === room?.hostUid }))
      .sort((a, b) => (b.isHost - a.isHost) || (a.joinedAt || 0) - (b.joinedAt || 0)),
    [room]
  );

  // Where the host is right now, for listeners whose audio isn't in step
  // (not started yet, or still loading the song).
  const hostPosition = useCallback(
    () => (state ? expectedPosition(state, serverNow()) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  const hostName = members.find((m) => m.isHost)?.name || "The host";

  // Tell a listener once per room who is in control.
  const announced = useRef(null);
  useEffect(() => {
    if (!code || isHost || !members.length || announced.current === code) return;
    announced.current = code;
    toast(`${hostName} has the controls. You'll hear what they play.`, { icon: "people" });
  }, [code, isHost, members.length, hostName, toast]);

  const value = useMemo(
    () => ({
      enabled: isRealtimeConfigured,
      code, room, isHost, members, hostName, joining, needsTap, visibility,
      create, join, leave, end, sync, hostPosition, setVisibility,
    }),
    [code, room, isHost, members, hostName, joining, needsTap, visibility,
      create, join, leave, end, sync, hostPosition, setVisibility]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) throw new Error("useRoom must be used inside a RoomProvider.");
  return context;
}
