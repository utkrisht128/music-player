/**
 * localStorage wrapper.
 *
 * Every access is guarded: storage throws in private-mode Safari, when the
 * quota is exceeded, and when a browser is configured to block site data.
 * A storage failure must never take the player down, so reads fall back to a
 * default and writes fail silently (reported once to the console).
 */

const PREFIX = "mp:";
let warned = false;

function warnOnce(error) {
  if (warned) return;
  warned = true;
  // eslint-disable-next-line no-console
  console.warn("Local storage unavailable — state will not persist.", error);
}

export function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === undefined ? fallback : parsed;
  } catch (error) {
    warnOnce(error);
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}

export function removeKey(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (error) {
    warnOnce(error);
  }
}

export const STORAGE_KEYS = {
  playlists: "playlists",
  liked: "liked",
  recent: "recent",
  player: "player",
  durations: "durations",
  syncedUid: "syncedUid",
};
