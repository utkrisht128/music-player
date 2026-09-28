/**
 * Google Analytics (GA4) via Firebase, free and unlimited.
 *
 * Needs REACT_APP_FIREBASE_MEASUREMENT_ID. Without it (or in browsers where
 * Analytics is unsupported) every call is a silent no-op, so callers never
 * need to check. Events show up in Firebase console -> Analytics -> Events;
 * DebugView shows them live when the site is opened with ?debug_mode=1 or
 * the GA Debugger extension.
 */
import { app, isAnalyticsConfigured } from "./firebase";

let ready = null;

function load() {
  if (!ready) {
    ready = isAnalyticsConfigured
      ? import("firebase/analytics")
          .then(async (mod) => ((await mod.isSupported()) ? { mod, analytics: mod.getAnalytics(app) } : null))
          .catch(() => null)
      : Promise.resolve(null);
  }
  return ready;
}

/** Log a GA4 event. Param values must be strings or numbers (max 100 chars). */
export function track(name, params = {}) {
  load().then((ga) => {
    if (!ga) return;
    const clean = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      clean[key] = typeof value === "number" ? value : String(value).slice(0, 100);
    });
    ga.mod.logEvent(ga.analytics, name, clean);
  });
}

/** Common song fields, so reports can group by title, artist or source. */
export function trackParams(track) {
  if (!track) return {};
  return {
    track_id: track.id,
    track_title: track.title,
    track_artist: (track.artists || []).join(", "),
    track_source: track.source || "catalog",
  };
}

/** Tie events to the signed-in account (uid only, never email). */
export function setAnalyticsUser(uid) {
  load().then((ga) => {
    if (ga) ga.mod.setUserId(ga.analytics, uid || null);
  });
}
