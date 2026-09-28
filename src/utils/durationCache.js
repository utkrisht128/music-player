/**
 * Track durations are read from each audio file rather than hardcoded.
 *
 * We create a detached Audio element with preload="metadata", wait for the
 * metadata event, and cache the result (in memory + localStorage) keyed by
 * track id. Probes are queued with a small concurrency limit so opening a page
 * with 21 rows does not fire 21 simultaneous range requests.
 *
 * A failed probe resolves to null — callers render a placeholder, never a
 * fabricated number.
 */

import { readJSON, writeJSON, STORAGE_KEYS } from "./storage";

const MAX_CONCURRENT = 4;
const PROBE_TIMEOUT_MS = 10000;

const cache = new Map(Object.entries(readJSON(STORAGE_KEYS.durations, {})));
const inFlight = new Map();
const listeners = new Set();
const queue = [];
let active = 0;
let persistTimer = null;

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeJSON(STORAGE_KEYS.durations, Object.fromEntries(cache));
  }, 800);
}

function notify(trackId, duration) {
  listeners.forEach((fn) => fn(trackId, duration));
}

/** Subscribe to duration discoveries. Returns an unsubscribe function. */
export function onDuration(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCachedDuration(trackId) {
  const value = cache.get(trackId);
  return typeof value === "number" ? value : null;
}

function probe(src) {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      // Release the network/decoder resources held by the probe element.
      audio.src = "";
      resolve(value);
    };

    const onLoaded = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    const onError = () => finish(null);
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    audio.preload = "metadata";
    audio.src = src;
  });
}

function run(job) {
  active += 1;
  probe(job.src)
    .then((duration) => {
      if (duration != null) {
        cache.set(job.trackId, duration);
        persistSoon();
        notify(job.trackId, duration);
      }
      job.resolve(duration);
    })
    .finally(() => {
      active -= 1;
      inFlight.delete(job.trackId);
      pump();
    });
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    run(queue.shift());
  }
}

/**
 * Resolve a track duration, using the cache when possible.
 * Concurrent callers for the same track share one probe.
 */
export function ensureDuration(track) {
  if (!track || !track.src) return Promise.resolve(null);

  const cached = getCachedDuration(track.id);
  if (cached != null) return Promise.resolve(cached);

  // Streamed tracks (YouTube) carry their duration from the API and cannot be
  // probed with an <audio> element.
  if (track.source === "youtube") {
    if (Number.isFinite(track.duration)) recordDuration(track.id, track.duration);
    return Promise.resolve(Number.isFinite(track.duration) ? track.duration : null);
  }

  const pending = inFlight.get(track.id);
  if (pending) return pending;

  const promise = new Promise((resolve) => {
    queue.push({ trackId: track.id, src: track.src, resolve });
    pump();
  });
  inFlight.set(track.id, promise);
  return promise;
}

/** Record a duration we already know (the player learns it on playback). */
export function recordDuration(trackId, duration) {
  if (!trackId || !Number.isFinite(duration) || duration <= 0) return;
  if (cache.get(trackId) === duration) return;
  cache.set(trackId, duration);
  persistSoon();
  notify(trackId, duration);
}
