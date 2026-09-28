import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import AudioManager from "../audio/AudioManager";
import { getTracks, getRadioTracks, getRecommendations } from "../services/musicService";
import { addListening, addPlay } from "../utils/stats";
import { useSettings } from "./SettingsContext";
import { readJSON, writeJSON, STORAGE_KEYS } from "../utils/storage";
import { recordDuration } from "../utils/durationCache";
import { useLibrary } from "./LibraryContext";
import { useUI } from "./UIContext";
import { track as trackEvent, trackParams } from "../services/analytics";

/**
 * Playback state: what is loaded, the queue, and the transport settings.
 *
 * The queue is an array of full track objects in PLAY order. Shuffling
 * reorders that array in place (keeping the current track where it is) rather
 * than maintaining a parallel index map — one source of truth for "what plays
 * next", which is what the old index arithmetic kept getting wrong.
 */

const PlayerContext = createContext(null);

export const REPEAT = { OFF: "off", ALL: "all", ONE: "one" };

/** Fisher-Yates over a copy. */
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadSettings() {
  const saved = readJSON(STORAGE_KEYS.player, {});
  const volume = Number(saved.volume);
  return {
    volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1,
    muted: Boolean(saved.muted),
    shuffle: Boolean(saved.shuffle),
    repeat: Object.values(REPEAT).includes(saved.repeat) ? saved.repeat : REPEAT.OFF,
    queueIds: Array.isArray(saved.queueIds) ? saved.queueIds : [],
    index: Number.isInteger(saved.index) ? saved.index : 0,
    contextLabel: typeof saved.contextLabel === "string" ? saved.contextLabel : null,
  };
}

export function PlayerProvider({ children }) {
  const { recordPlay } = useLibrary();
  const { toast } = useUI();
  const { autoplay, crossfade } = useSettings();

  // Both are created once and never recreated. useRef(expr) would re-evaluate
  // the expression on every render and throw the result away, which for
  // AudioManager means constructing a spare audio element each time.
  const initialRef = useRef(null);
  if (initialRef.current === null) initialRef.current = loadSettings();
  const initial = initialRef.current;

  const managerRef = useRef(null);
  if (managerRef.current === null) managerRef.current = new AudioManager();
  const manager = managerRef.current;

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(null);
  const [volume, setVolumeState] = useState(initial.volume);
  const [muted, setMutedState] = useState(initial.muted);
  const [shuffle, setShuffle] = useState(initial.shuffle);
  const [repeat, setRepeat] = useState(initial.repeat);
  const [contextLabel, setContextLabel] = useState(initial.contextLabel);
  const [isRestoring, setIsRestoring] = useState(initial.queueIds.length > 0);
  // null | { at: epoch ms } | { endOfTrack: true }
  const [sleep, setSleep] = useState(null);

  const currentTrack = queue[index] || null;

  // Event handlers read fresh values through refs: the AudioManager
  // subscriptions are attached once, and must not capture stale state.
  const stateRef = useRef({});
  stateRef.current = { queue, index, repeat, shuffle, currentTrack, autoplay, sleep, contextLabel };

  // ------------------------------------------------------- restore on boot
  useEffect(() => {
    let cancelled = false;
    if (initial.queueIds.length === 0) return undefined;

    getTracks(initial.queueIds)
      .then((tracks) => {
        if (cancelled || tracks.length === 0) return;
        setQueue(tracks);
        setIndex(Math.min(Math.max(initial.index, 0), tracks.length - 1));
        // Deliberately NOT resuming playback: browsers block audio that no
        // user gesture asked for, and a silent "playing" UI would be a lie.
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => { cancelled = true; };
  }, [initial.queueIds, initial.index]);

  // ------------------------------------------------------- audio bindings
  useEffect(() => {
    const offs = [
      manager.on("time", (value) => setCurrentTime(value)),
      manager.on("duration", (value) => {
        setDuration(value);
        const track = stateRef.current.currentTrack;
        if (track) recordDuration(track.id, value);
      }),
      manager.on("play", () => { setIsPlaying(true); setIsLoading(false); }),
      manager.on("pause", () => setIsPlaying(false)),
      manager.on("loading", (value) => setIsLoading(value)),
      manager.on("blocked", () => {
        setIsPlaying(false);
        toast("Press play to start — your browser blocked autoplay.");
      }),
      manager.on("error", (message) => {
        setIsLoading(false);
        const { queue: q, currentTrack: track } = stateRef.current;
        // A YouTube video that refuses to embed is common and not the
        // listener's fault: say so and move on instead of stalling.
        if (track?.source === "youtube" && q.length > 1) {
          toast(`Skipped "${track.title}" — ${message}`, { tone: "error" });
          skipNextRef.current(false);
          return;
        }
        setIsPlaying(false);
        toast(message, { tone: "error" });
      }),
      manager.on("ended", () => handleEnded()),
    ];
    return () => offs.forEach((off) => off());
    // handleEnded is stable via stateRef; binding once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, toast]);

  // Fade in at the start and out at the end of each song when crossfade is on.
  // Applied through the manager volume, so it works for files and YouTube.
  const fade = useMemo(() => {
    if (!crossfade || !duration || duration < crossfade * 3) return 1;
    const remaining = duration - currentTime;
    if (remaining < crossfade) return Math.max(0, remaining / crossfade);
    if (currentTime < crossfade / 2) return Math.max(0.15, currentTime / (crossfade / 2));
    return 1;
  }, [crossfade, duration, currentTime]);

  useEffect(() => { manager.setVolume(volume * fade); }, [manager, volume, fade]);
  useEffect(() => { manager.setMuted(muted); }, [manager, muted]);

  // Load the current track into the element whenever it changes.
  useEffect(() => {
    if (!currentTrack) return;
    const changed = manager.load(currentTrack.src);
    if (changed) {
      setCurrentTime(0);
      setDuration(null);
    }
  }, [manager, currentTrack]);

  /**
   * Drive the element from intent, never the other way round.
   *
   * This effect is ordered AFTER the load effect above, so a newly selected
   * track is always loaded before we ask it to play. Calling play() directly
   * from a click handler instead would race the load and silently resolve
   * against the previous (or no) source — leaving the UI claiming to play
   * while the element sat paused.
   *
   * play() and pause() are idempotent, so the echoed "play"/"pause" events
   * that sync state back cannot loop.
   */
  useEffect(() => {
    if (!currentTrack) return;
    if (isPlaying) manager.play();
    else manager.pause();
  }, [manager, currentTrack, isPlaying]);

  // ---------------------------------------------------------- persistence
  useEffect(() => {
    if (isRestoring) return;
    // Tracks chosen from the device are backed by object URLs that die with
    // the page, so they are excluded rather than restored as broken rows.
    const queueIds = queue.filter((track) => track.source !== "device").map((track) => track.id);
    const persistedIndex = currentTrack ? queueIds.indexOf(currentTrack.id) : 0;
    writeJSON(STORAGE_KEYS.player, {
      volume, muted, shuffle, repeat, contextLabel,
      queueIds,
      index: persistedIndex >= 0 ? persistedIndex : 0,
    });
  }, [queue, currentTrack, volume, muted, shuffle, repeat, contextLabel, isRestoring]);

  // ------------------------------------------------------------- controls
  const playAt = useCallback(
    (nextIndex) => {
      const track = stateRef.current.queue[nextIndex];
      // Replaying the row that is already loaded changes neither dependency of
      // the sync effect, so this case is driven explicitly: rewind, and play
      // in case we were paused.
      if (track && manager.currentSrc === track.src) {
        manager.seek(0);
        manager.play();
      }
      setIndex(nextIndex);
      setIsPlaying(true);
    },
    [manager]
  );

  /** Advance. `auto` distinguishes a finished track from a Next press. */
  const skipNext = useCallback(
    (auto = false) => {
      const { queue: q, index: i, repeat: mode } = stateRef.current;
      if (q.length === 0) return;

      if (!auto && q[i]) {
        trackEvent("song_skip", { ...trackParams(q[i]), seconds_played: Math.round(manager.getCurrentTime()) });
      }

      if (auto && mode === REPEAT.ONE) {
        manager.seek(0);
        manager.play();
        return;
      }

      if (auto && stateRef.current.sleep?.endOfTrack) {
        setSleep(null);
        setIsPlaying(false);
        toast("Sleep timer: stopped at the end of the song.", { icon: "clock" });
        return;
      }

      const isLast = i >= q.length - 1;
      if (isLast && mode === REPEAT.OFF && auto) {
        if (stateRef.current.autoplay) {
          // Radio: keep going with similar songs instead of falling silent.
          const seed = q[i];
          const exclude = q.map((t) => t.id);
          (seed?.source === "youtube" ? getRadioTracks(seed, exclude, 10) : getRecommendations([seed?.id].filter(Boolean), 10))
            .then((more) => more.filter((t) => !exclude.includes(t.id)))
            .then((more) => {
              if (more.length === 0) throw new Error("nothing similar");
              const next = [...stateRef.current.queue, ...more];
              stateRef.current.queue = next;
              setQueue(next);
              setContextLabel("Radio");
              playAt(i + 1);
            })
            .catch(() => {
              manager.pause();
              manager.seek(0);
              setIsPlaying(false);
            });
          return;
        }
        // End of queue: stop cleanly at the last track rather than looping.
        manager.pause();
        manager.seek(0);
        setIsPlaying(false);
        return;
      }

      playAt(isLast ? 0 : i + 1);
    },
    [manager, playAt, toast]
  );

  const skipPrevious = useCallback(() => {
    const { queue: q, index: i } = stateRef.current;
    if (q.length === 0) return;
    // Standard transport behaviour: restart the track if we are past 3s.
    if (manager.getCurrentTime() > 3) {
      manager.seek(0);
      return;
    }
    playAt(i <= 0 ? q.length - 1 : i - 1);
  }, [manager, playAt]);

  function handleEnded() {
    const finished = stateRef.current.currentTrack;
    if (finished) trackEvent("song_complete", trackParams(finished));
    skipNextRef.current(true);
  }
  const skipNextRef = useRef(skipNext);
  skipNextRef.current = skipNext;

  // Flip intent only; the sync effect applies it to the element.
  const togglePlay = useCallback(() => {
    if (!stateRef.current.currentTrack) return;
    setIsPlaying((playing) => !playing);
  }, []);

  /**
   * Start a new playback context (an album, a playlist, search results).
   * `startIndex` refers to the list as displayed; when shuffle is on the
   * chosen track still plays first, with everything else reordered behind it.
   */
  const playTracks = useCallback(
    (tracks, startIndex = 0, label = null) => {
      if (!tracks || tracks.length === 0) {
        toast("There is nothing to play here yet.");
        return;
      }
      const start = Math.min(Math.max(startIndex, 0), tracks.length - 1);
      let ordered = tracks;
      let position = start;

      if (stateRef.current.shuffle) {
        const chosen = tracks[start];
        ordered = [chosen, ...shuffled(tracks.filter((_, i) => i !== start))];
        position = 0;
      }

      setQueue(ordered);
      setContextLabel(label);
      stateRef.current.queue = ordered;
      playAt(position);
    },
    [playAt, toast]
  );

  /** Play a list shuffled from the start, regardless of the shuffle toggle. */
  const shufflePlay = useCallback(
    (tracks, label = null) => {
      if (!tracks || tracks.length === 0) {
        toast("There is nothing to play here yet.");
        return;
      }
      const ordered = shuffled(tracks);
      setShuffle(true);
      setQueue(ordered);
      setContextLabel(label);
      stateRef.current.queue = ordered;
      playAt(0);
    },
    [playAt, toast]
  );

  const toggleShuffle = useCallback(() => {
    setShuffle((wasOn) => {
      const nowOn = !wasOn;
      setQueue((current) => {
        if (current.length < 2) return current;
        const playing = current[stateRef.current.index];
        // Reorder only what has not been played yet, so shuffling mid-track
        // never yanks the current song out from under the listener.
        const upcoming = current.slice(stateRef.current.index + 1);
        const history = current.slice(0, stateRef.current.index);
        const next = [...history, playing, ...(nowOn ? shuffled(upcoming) : upcoming)];
        stateRef.current.queue = next;
        return next;
      });
      return nowOn;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((mode) =>
      mode === REPEAT.OFF ? REPEAT.ALL : mode === REPEAT.ALL ? REPEAT.ONE : REPEAT.OFF
    );
  }, []);

  const seek = useCallback((seconds) => manager.seek(seconds), [manager]);
  const nudge = useCallback((delta) => manager.nudge(delta), [manager]);

  const setVolume = useCallback((value) => {
    setVolumeState(value);
    // Moving the slider off zero is an unmute; this is what users expect.
    if (value > 0) setMutedState(false);
  }, []);

  const toggleMute = useCallback(() => setMutedState((value) => !value), []);

  // ---------------------------------------------------------- queue edits
  /** Insert directly after the current track. */
  const playNext = useCallback((track) => {
    setQueue((current) => {
      if (current.length === 0) return [track];
      const next = [...current];
      next.splice(stateRef.current.index + 1, 0, track);
      stateRef.current.queue = next;
      return next;
    });
  }, []);

  const addToQueue = useCallback((track) => {
    setQueue((current) => {
      const next = [...current, track];
      stateRef.current.queue = next;
      return next;
    });
  }, []);

  const removeFromQueue = useCallback((position) => {
    setQueue((current) => {
      if (position < 0 || position >= current.length) return current;
      const next = current.filter((_, i) => i !== position);
      stateRef.current.queue = next;
      // Keep the playing track under the cursor when something above it goes.
      if (position < stateRef.current.index) setIndex((i) => i - 1);
      else if (position === stateRef.current.index) {
        if (next.length === 0) {
          manager.pause();
          setIsPlaying(false);
          setIndex(0);
        } else {
          setIndex(Math.min(stateRef.current.index, next.length - 1));
        }
      }
      return next;
    });
  }, [manager]);

  const moveInQueue = useCallback((from, to) => {
    setQueue((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return current;
      next.splice(to, 0, moved);
      stateRef.current.queue = next;
      const playing = current[stateRef.current.index];
      const newIndex = next.indexOf(playing);
      if (newIndex >= 0) setIndex(newIndex);
      return next;
    });
  }, []);

  /** Drop everything except the track currently playing. */
  const clearQueue = useCallback(() => {
    setQueue((current) => {
      const playing = current[stateRef.current.index];
      const next = playing ? [playing] : [];
      stateRef.current.queue = next;
      setIndex(0);
      return next;
    });
  }, []);

  // ---------------------------------------------------------- sleep timer
  useEffect(() => {
    if (!sleep?.at) return undefined;
    const timer = setTimeout(() => {
      setIsPlaying(false);
      setSleep(null);
      toast("Sleep timer: playback paused. Good night!", { icon: "clock" });
    }, Math.max(0, sleep.at - Date.now()));
    return () => clearTimeout(timer);
  }, [sleep, toast]);

  // ------------------------------------------------ listening time (stats)
  const lastTick = useRef({ id: null, time: 0 });
  useEffect(() => {
    const prev = lastTick.current;
    if (isPlaying && currentTrack && prev.id === currentTrack.id) {
      addListening(currentTrack.id, currentTime - prev.time);
    }
    lastTick.current = { id: currentTrack?.id || null, time: currentTime };
  }, [currentTime, isPlaying, currentTrack]);

  // --------------------------------------- lock screen / headphone controls
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  const controlsRef = useRef({});
  useEffect(() => {
    if (!ms || !currentTrack) return;
    ms.metadata = new window.MediaMetadata({
      title: currentTrack.title,
      artist: (currentTrack.artists || []).join(", "),
      album: currentTrack.albumTitle || "",
      artwork: currentTrack.artwork
        ? [{ src: new URL(currentTrack.artwork, window.location.href).href, sizes: "512x512" }]
        : [],
    });
  }, [ms, currentTrack]);

  useEffect(() => {
    if (ms) ms.playbackState = currentTrack ? (isPlaying ? "playing" : "paused") : "none";
  }, [ms, isPlaying, currentTrack]);

  useEffect(() => {
    if (!ms || !duration || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
    } catch (error) { /* some browsers reject during track changes */ }
  }, [ms, duration, currentTime]);

  useEffect(() => {
    if (!ms) return undefined;
    const handlers = {
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      stop: () => setIsPlaying(false),
      previoustrack: () => controlsRef.current.skipPrevious(),
      nexttrack: () => controlsRef.current.skipNext(false),
      seekbackward: (d) => manager.nudge(-(d.seekOffset || 10)),
      seekforward: (d) => manager.nudge(d.seekOffset || 10),
      seekto: (d) => manager.seek(d.seekTime),
    };
    Object.entries(handlers).forEach(([action, fn]) => {
      try { ms.setActionHandler(action, fn); } catch (error) { /* unsupported action */ }
    });
    return () => Object.keys(handlers).forEach((action) => {
      try { ms.setActionHandler(action, null); } catch (error) { /* ignore */ }
    });
  }, [ms, manager]);

  /** minutes > 0: pause after that long; "track": at the end of this song; null: off. */
  const setSleepTimer = useCallback((minutes) => {
    if (minutes === "track") setSleep({ endOfTrack: true });
    else if (minutes > 0) setSleep({ at: Date.now() + minutes * 60000 });
    else setSleep(null);
  }, []);

  // History is written when audio actually starts, not when a row is clicked.
  const lastRecorded = useRef(null);
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    if (lastRecorded.current === currentTrack.id) return;
    lastRecorded.current = currentTrack.id;
    recordPlay(currentTrack.id);
    addPlay(currentTrack.id);
    trackEvent("song_play", { ...trackParams(currentTrack), context: stateRef.current.contextLabel || "" });
  }, [isPlaying, currentTrack, recordPlay]);

  const value = useMemo(
    () => ({
      manager,
      queue, index, currentTrack,
      isPlaying, isLoading, isRestoring,
      currentTime, duration, contextLabel,
      volume, muted, shuffle, repeat,
      playTracks, shufflePlay, playAt, togglePlay, skipNext, skipPrevious,
      seek, nudge, setVolume, toggleMute, toggleShuffle, cycleRepeat,
      playNext, addToQueue, removeFromQueue, moveInQueue, clearQueue,
      sleep, setSleepTimer,
    }),
    [
      manager, queue, index, currentTrack, isPlaying, isLoading, isRestoring,
      currentTime, duration, contextLabel, volume, muted, shuffle, repeat,
      playTracks, shufflePlay, playAt, togglePlay, skipNext, skipPrevious,
      seek, nudge, setVolume, toggleMute, toggleShuffle, cycleRepeat,
      playNext, addToQueue, removeFromQueue, moveInQueue, clearQueue,
      sleep, setSleepTimer,
    ]
  );
  controlsRef.current = { skipNext, skipPrevious };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside a PlayerProvider.");
  return context;
}
