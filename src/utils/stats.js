/**
 * Listening statistics, kept per day so any range can be summed:
 *
 *   { "2026-09-26": { plays: { trackId: n }, seconds: { trackId: s } } }
 *
 * Only this listener's own history, stored locally. Days older than a year
 * are dropped to keep storage small.
 */

import { readJSON, writeJSON } from "./storage";

const KEY = "stats";
const KEEP_DAYS = 366;

let data = readJSON(KEY, {});
if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
let timer = null;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function bucket() {
  const day = today();
  if (!data[day]) {
    data[day] = { plays: {}, seconds: {} };
    const days = Object.keys(data).sort();
    days.slice(0, Math.max(0, days.length - KEEP_DAYS)).forEach((old) => delete data[old]);
  }
  return data[day];
}

function persistSoon() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    writeJSON(KEY, data);
  }, 2000);
}

export function addPlay(trackId) {
  const b = bucket();
  b.plays[trackId] = (b.plays[trackId] || 0) + 1;
  persistSoon();
}

export function addListening(trackId, seconds) {
  if (!trackId || !(seconds > 0) || seconds > 5) return; // ignore seeks / stalls
  const b = bucket();
  b.seconds[trackId] = (b.seconds[trackId] || 0) + seconds;
  persistSoon();
}

/** Sum plays and seconds per track over the last `days` days (0 = all time). */
export function summarise(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  const from = days > 0 ? `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}` : "";

  const plays = {};
  const seconds = {};
  const perDay = {};
  Object.entries(data).forEach(([day, b]) => {
    if (day < from) return;
    let daySeconds = 0;
    Object.entries(b.plays || {}).forEach(([id, n]) => { plays[id] = (plays[id] || 0) + n; });
    Object.entries(b.seconds || {}).forEach(([id, s]) => {
      seconds[id] = (seconds[id] || 0) + s;
      daySeconds += s;
    });
    perDay[day] = daySeconds;
  });
  const totalSeconds = Object.values(seconds).reduce((a, b) => a + b, 0);
  const totalPlays = Object.values(plays).reduce((a, b) => a + b, 0);
  return { plays, seconds, perDay, totalSeconds, totalPlays };
}

export function exportStats() {
  return data;
}
