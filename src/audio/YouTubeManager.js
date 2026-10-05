/**
 * YouTubeManager — drives the official YouTube IFrame player with the same
 * interface and events as AudioManager, so PlayerContext does not care which
 * one is behind a track.
 *
 * The iframe lives in a fixed host element (#yt-dock) that the VideoDock
 * component styles and shows while a YouTube track is loaded. YouTube's terms
 * require the player to remain visible; do not hide it or strip its UI.
 */

const HOST_ID = "yt-dock-player";
let apiPromise = null;

function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Could not load the YouTube player."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function ensureHost() {
  let dock = document.getElementById("yt-dock");
  if (!dock) {
    dock = document.createElement("div");
    dock.id = "yt-dock";
    dock.className = "yt-dock";
    dock.setAttribute("aria-label", "YouTube player");
    document.body.appendChild(dock);
  }
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    dock.appendChild(host);
  }
  return host;
}

const ERRORS = {
  2: "This YouTube video id is invalid.",
  5: "This video cannot be played in the browser player.",
  100: "This video was removed or made private.",
  101: "The owner does not allow this video to play outside YouTube.",
  150: "The owner does not allow this video to play outside YouTube.",
};

export default class YouTubeManager {
  constructor(emit) {
    this.emit = emit;
    this.player = null;
    this.ready = false;
    this.videoId = null;
    this.wantPlay = false;
    this.volume = 1;
    this.muted = false;
    this.timer = null;
    this.readyPromise = null;
    this.startCheck = null;
    this.resumeTimer = null;

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (this.wantPlay && this.ready && this.player) {
          const S = window.YT?.PlayerState;
          if (S && typeof this.player.getPlayerState === "function") {
            const state = this.player.getPlayerState();
            if (state !== S.PLAYING && state !== S.BUFFERING) {
              try {
                this.player.playVideo();
              } catch (e) {
                /* ignore */
              }
            }
          }
        }
      });
    }
  }

  init() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = loadApi().then(
      (YT) =>
        new Promise((resolve) => {
          ensureHost();
          this.player = new YT.Player(HOST_ID, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
            events: {
              onReady: () => {
                this.ready = true;
                this.applyVolume();
                resolve();
              },
              onStateChange: (event) => this.onState(event.data),
              onError: (event) => {
                this.emit("loading", false);
                this.emit("error", ERRORS[event.data] || "This video could not be played.");
              },
            },
          });
        })
    );
    this.readyPromise.catch((error) => {
      this.readyPromise = null;
      this.emit("error", error.message);
    });
    return this.readyPromise;
  }

  onState(state) {
    const S = window.YT.PlayerState;
    if (state === S.PLAYING) {
      this.clearStartCheck();
      this.emit("loading", false);
      this.emit("play");
      const d = this.player.getDuration();
      if (d > 0) this.emit("duration", d);
      this.startTicking();
    } else if (state === S.PAUSED) {
      this.stopTicking();
      // If the listener intended to play (wantPlay is true), but YouTube/browser auto-paused
      // (e.g. screen off or tab hidden on mobile), attempt background auto-resume.
      if (this.wantPlay && typeof document !== "undefined" && document.hidden) {
        if (this.resumeTimer) clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => {
          if (this.wantPlay && this.ready && this.player) {
            try {
              this.player.playVideo();
            } catch (e) {
              /* ignore */
            }
          }
        }, 120);
        return;
      }
      this.emit("pause");
    } else if (state === S.BUFFERING) {
      this.emit("loading", true);
    } else if (state === S.ENDED) {
      this.stopTicking();
      this.emit("ended");
    } else if (state === S.CUED) {
      this.emit("loading", false);
    }
  }

  startTicking() {
    this.stopTicking();
    this.timer = setInterval(() => {
      if (this.player && this.ready) this.emit("time", this.player.getCurrentTime() || 0);
    }, 250);
  }

  stopTicking() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async load(videoId) {
    this.videoId = videoId;
    this.wantPlay = false;
    this.emit("loading", true);
    await this.init();
    if (this.videoId !== videoId) return; // superseded while the API loaded
    if (this.wantPlay) this.player.loadVideoById(videoId);
    else this.player.cueVideoById(videoId);
    this.loadedId = videoId;
  }

  async play() {
    this.wantPlay = true;
    await this.init();
    if (!this.videoId) return;
    if (this.loadedId !== this.videoId) {
      this.player.loadVideoById(this.videoId);
      this.loadedId = this.videoId;
    } else {
      this.player.playVideo();
    }
    this.watchStart();
  }

  /**
   * Autoplay policy: when play is not triggered by a click, YouTube does not
   * raise an error. It often goes BUFFERING and then quietly falls back to
   * UNSTARTED, so a single check that sees BUFFERING is not enough. Keep
   * checking until it is really PLAYING; if it isn't within ~10s (or it has
   * dropped back to unstarted/cued), report it as blocked so the UI stops
   * claiming to play.
   */
  watchStart(attempt = 0) {
    this.clearStartCheck();
    this.startCheck = setTimeout(() => {
      this.startCheck = null;
      if (!this.wantPlay || !this.ready) return;
      const S = window.YT.PlayerState;
      const state = this.player.getPlayerState();
      if (state === S.PLAYING || state === S.ENDED) return;
      if (state === S.BUFFERING && attempt < 4) {
        this.watchStart(attempt + 1);
        return;
      }
      this.wantPlay = false;
      this.emit("loading", false);
      this.emit("pause");
      this.emit("blocked");
    }, attempt === 0 ? 3000 : 2000);
  }

  clearStartCheck() {
    if (this.startCheck) clearTimeout(this.startCheck);
    this.startCheck = null;
  }

  pause() {
    this.clearStartCheck();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.wantPlay = false;
    this.stopTicking();
    if (this.ready) this.player.pauseVideo();
  }

  stop() {
    this.clearStartCheck();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.wantPlay = false;
    this.videoId = null;
    this.stopTicking();
    if (this.ready) this.player.stopVideo();
  }

  seek(seconds) {
    if (!this.ready || !Number.isFinite(seconds)) return;
    this.player.seekTo(Math.max(0, seconds), true);
    this.emit("time", seconds);
  }

  getCurrentTime() {
    return this.ready ? this.player.getCurrentTime() || 0 : 0;
  }

  setVolume(volume) {
    this.volume = volume;
    this.applyVolume();
  }

  setMuted(muted) {
    this.muted = muted;
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ready) return;
    this.player.setVolume(Math.round(this.volume * 100));
    if (this.muted) this.player.mute();
    else this.player.unMute();
  }
}
