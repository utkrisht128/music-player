/**
 * Search history for the AI song finder, kept on this device only.
 *
 * Each entry is one run: what was asked (words, filters, photo thumbnail,
 * what the AI saw in the photo), the exact prompt sent, which model
 * answered, every song it suggested and what we found for it on YouTube,
 * and the step-by-step log. That log is what explains a poor result: a bad
 * photo reading, a vague prompt, made-up songs, or songs YouTube couldn't match.
 *
 * Entries older than 48 hours are removed automatically.
 */
import { readJSON, writeJSON } from "../utils/storage";

const KEY = "aiHistory.v1";
export const HISTORY_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
const listeners = new Set();

const fresh = (entries) => entries.filter((e) => e && Date.now() - e.at < HISTORY_TTL_MS);

export function getHistory() {
  const all = readJSON(KEY, []);
  const kept = fresh(Array.isArray(all) ? all : []);
  if (kept.length !== all.length) writeJSON(KEY, kept);
  return kept;
}

function save(entries) {
  let list = entries.slice(0, MAX_ENTRIES);
  // Storage full: drop the oldest until it fits.
  while (list.length && !writeJSON(KEY, list)) list = list.slice(0, -1);
  listeners.forEach((fn) => fn(list));
}

/** The steps of a trace, kept short: name, model, result, time, error, notes. */
export function summarizeSteps(trace) {
  return (trace?.steps || []).map((s) => ({
    name: s.name,
    model: s.model || null,
    status: s.status,
    ms: s.duration ?? null,
    error: s.error?.message || s.error?.errorType || null,
    notes: s.notes || [],
  }));
}

/** Adds (or, with the same id, updates) a run. Returns its id. */
export function addHistory(entry) {
  const id = entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const record = { at: Date.now(), ...entry, id };
  save([record, ...getHistory().filter((e) => e.id !== id)]);
  return id;
}

export function removeHistory(id) {
  save(getHistory().filter((e) => e.id !== id));
}

export function clearHistory() {
  save([]);
}

export function onHistoryChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hours until an entry is deleted (for the list). */
export const hoursLeft = (entry) => Math.max(0, Math.ceil((entry.at + HISTORY_TTL_MS - Date.now()) / 3600000));

/** A tiny JPEG of the photo for the history list (~4 KB). */
export function thumbnail(dataUrl, side = 96) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const scale = side / Math.max(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
