/** Formatting helpers shared across the app. */

/**
 * Seconds -> "m:ss" (or "h:mm:ss" past an hour).
 * Returns a placeholder for unknown durations rather than "0:00", so the UI
 * can distinguish "not loaded yet" from "zero length".
 */
export function formatTime(seconds, placeholder = "-:--") {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return placeholder;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Long form used for playlist/album totals: "1 hr 12 min" / "8 min 4 sec". */
export function formatTotalDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  const s = total % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

/** "AP Dhillon, Gurinder Gill" */
export function joinArtists(artists) {
  return Array.isArray(artists) ? artists.join(", ") : artists || "Unknown artist";
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Relative time for the recently-played list. */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(timestamp).toLocaleDateString();
}
