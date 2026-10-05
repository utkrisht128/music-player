/**
 * AudioManager — the single owner of the HTMLAudioElement.
 *
 *   UI -> PlayerContext -> AudioManager -> audio element
 *
 * Nothing else in the app is allowed to touch an audio element. The old code
 * called `.play()` / `.pause()` from a `useEffect` keyed on two values, which
 * raced with React re-renders and produced unhandled AbortErrors whenever a
 * track changed mid-play.
 *
 * This class is framework-agnostic and emits events; PlayerContext adapts it
 * to React state.
 */

import YouTubeManager from "./YouTubeManager";

const YT_PREFIX = "youtube:";
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

const EVENTS = [
  "play",
  "pause",
  "time",
  "duration",
  "ended",
  "error",
  "volume",
  "loading",
  // Autoplay policy refused a play() we did not initiate from a user gesture.
  "blocked",
];

export default class AudioManager {
  constructor() {
    this.audio = typeof Audio !== "undefined" ? new Audio() : null;
    // Silent audio element acts as an active audio anchor to preserve background process privileges
    // on mobile browsers (iOS Safari, Android Chrome) during YouTube iframe playback.
    this.silentAudio = typeof Audio !== "undefined" ? new Audio(SILENT_WAV) : null;
    if (this.silentAudio) {
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.01;
    }
    this.backgroundPlayEnabled = true;

    this.listeners = new Map(EVENTS.map((name) => [name, new Set()]));
    this.currentSrc = null;
    // Guards against the browser AbortError raised when a pending play()
    // promise is interrupted by a new load().
    this.playToken = 0;
    // "audio" or "youtube": which backend owns the current source. Events from
    // the idle backend are dropped so it cannot flip the UI state.
    this.mode = "audio";
    this.youtube = new YouTubeManager((event, payload) => {
      if (this.mode === "youtube") this.emit(event, payload);
    });

    if (!this.audio) return;

    this.audio.preload = "metadata";

    this.audio.addEventListener("timeupdate", () => {
      this.emitAudio("time", this.audio.currentTime);
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.emitAudio("duration", this.audio.duration);
    });
    this.audio.addEventListener("durationchange", () => {
      if (Number.isFinite(this.audio.duration)) this.emitAudio("duration", this.audio.duration);
    });
    this.audio.addEventListener("play", () => this.emitAudio("play"));
    this.audio.addEventListener("pause", () => this.emitAudio("pause"));
    this.audio.addEventListener("ended", () => this.emitAudio("ended"));
    this.audio.addEventListener("waiting", () => this.emitAudio("loading", true));
    this.audio.addEventListener("canplay", () => this.emitAudio("loading", false));
    this.audio.addEventListener("playing", () => this.emitAudio("loading", false));
    this.audio.addEventListener("volumechange", () => {
      this.emitAudio("volume", { volume: this.audio.volume, muted: this.audio.muted });
    });
    this.audio.addEventListener("error", () => {
      this.emitAudio("loading", false);
      this.emitAudio("error", this.describeError(this.audio.error));
    });
  }

  setBackgroundPlay(enabled) {
    this.backgroundPlayEnabled = Boolean(enabled);
    if (!this.backgroundPlayEnabled) {
      this.stopSilentAnchor();
    } else if (this.mode === "youtube" && this.youtube.wantPlay) {
      this.startSilentAnchor();
    }
  }

  startSilentAnchor() {
    if (this.silentAudio && this.backgroundPlayEnabled) {
      this.silentAudio.play().catch(() => {});
    }
  }

  stopSilentAnchor() {
    if (this.silentAudio) {
      this.silentAudio.pause();
    }
  }

  /** Turns a MediaError code into something a listener can act on. */
  describeError(mediaError) {
    const code = mediaError && mediaError.code;
    switch (code) {
      case 1:
        return "Playback was stopped.";
      case 2:
        return "A network problem interrupted this track.";
      case 3:
        return "This audio file appears to be damaged.";
      case 4:
        return "This audio format is not supported by your browser.";
      default:
        return "This track could not be played.";
    }
  }

  emitAudio(event, payload) {
    if (this.mode === "audio") this.emit(event, payload);
  }

  get isYouTube() {
    return this.mode === "youtube";
  }

  on(event, handler) {
    const set = this.listeners.get(event);
    if (!set) throw new Error(`Unknown audio event: ${event}`);
    set.add(handler);
    return () => set.delete(handler);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) set.forEach((handler) => handler(payload));
  }

  /**
   * Point the element at a new source. Returns true when the source changed,
   * so callers can avoid restarting a track that is already loaded.
   */
  load(src) {
    if (!this.audio || !src) return false;
    if (this.currentSrc === src) return false;
    this.currentSrc = src;
    this.playToken += 1;

    if (src.startsWith(YT_PREFIX)) {
      if (this.audio) this.audio.pause();
      this.mode = "youtube";
      this.youtube.load(src.slice(YT_PREFIX.length));
      return true;
    }

    if (this.mode === "youtube") {
      this.youtube.stop();
      this.stopSilentAnchor();
    }
    this.mode = "audio";
    this.audio.src = src;
    this.audio.load();
    this.emit("loading", true);
    return true;
  }

  /**
   * Play, tolerating the two normal rejections:
   *  - AbortError: a newer load() superseded this call. Not an error.
   *  - NotAllowedError: autoplay policy. Reported so the UI stays honest
   *    about being paused rather than showing a false playing state.
   */
  async play() {
    if (this.mode === "youtube") {
      this.startSilentAnchor();
      await this.youtube.play();
      return true;
    }
    this.stopSilentAnchor();
    if (!this.audio || !this.currentSrc) return false;
    const token = this.playToken;
    try {
      await this.audio.play();
      return true;
    } catch (error) {
      if (token !== this.playToken || error.name === "AbortError") return false;
      if (error.name === "NotAllowedError") {
        this.emit("pause");
        this.emit("blocked");
        return false;
      }
      this.emit("error", "This track could not be played.");
      return false;
    }
  }

  pause() {
    this.stopSilentAnchor();
    if (this.mode === "youtube") this.youtube.pause();
    else if (this.audio) this.audio.pause();
  }

  seek(seconds) {
    if (this.mode === "youtube") {
      this.youtube.seek(seconds);
      return;
    }
    if (!this.audio || !Number.isFinite(seconds)) return;
    const duration = this.audio.duration;
    const max = Number.isFinite(duration) ? duration : seconds;
    this.audio.currentTime = Math.max(0, Math.min(seconds, max));
    this.emit("time", this.audio.currentTime);
  }

  /** Relative seek, used by the arrow-key shortcuts. */
  nudge(deltaSeconds) {
    this.seek(this.getCurrentTime() + deltaSeconds);
  }

  setVolume(volume) {
    this.youtube.setVolume(Math.max(0, Math.min(1, volume)));
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  setMuted(muted) {
    this.youtube.setMuted(Boolean(muted));
    if (this.audio) this.audio.muted = Boolean(muted);
  }

  getDuration() {
    return this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : null;
  }

  getCurrentTime() {
    if (this.mode === "youtube") return this.youtube.getCurrentTime();
    return this.audio ? this.audio.currentTime || 0 : 0;
  }

  destroy() {
    this.stopSilentAnchor();
    if (!this.audio) return;
    this.audio.pause();
    this.audio.src = "";
    this.listeners.forEach((set) => set.clear());
  }
}
