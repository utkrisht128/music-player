/**
 * What the AI can do right now, for the meter on the AI page.
 *
 * This is an internal tool, so there are no per-user caps: everyone gets the
 * project's full Gemini allowance. What we track is what Google tells us:
 *  - which models have used up today's free allowance (skipped until midnight),
 *  - a short cooldown when every model said "slow down" (429 per minute),
 *  - how many requests this browser made today (for information only).
 */
import { readJSON, writeJSON } from "../utils/storage";
import { MODELS } from "./aiModels";

const KEY = "aiUsage.v2";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

function fresh() {
  return { day: today(), dayCount: 0, cooldownUntil: 0, usedUpModels: [] };
}

function load() {
  const saved = readJSON(KEY, {});
  if (saved.day !== today()) return fresh();
  return {
    day: saved.day,
    dayCount: Number(saved.dayCount) || 0,
    cooldownUntil: Number(saved.cooldownUntil) || 0,
    usedUpModels: Array.isArray(saved.usedUpModels) ? saved.usedUpModels.filter((m) => MODELS.includes(m)) : [],
  };
}

let state = load();
const listeners = new Set();

function current() {
  if (state.day !== today()) state = fresh();
  return state;
}

function save() {
  writeJSON(KEY, state);
  const status = getAIUsage();
  listeners.forEach((fn) => fn(status));
}

function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/**
 * {
 *   usedToday, models: [{ name, available }], modelsLeft,
 *   blocked: null | "cooldown" | "day", readyAt (epoch ms, when blocked)
 * }
 */
export function getAIUsage(now = Date.now()) {
  const s = current();
  const models = MODELS.map((name) => ({ name, available: !s.usedUpModels.includes(name) }));
  const modelsLeft = models.filter((m) => m.available).length;
  let blocked = null;
  let readyAt = 0;
  if (modelsLeft === 0) {
    blocked = "day";
    readyAt = nextMidnight();
  } else if (s.cooldownUntil > now) {
    blocked = "cooldown";
    readyAt = s.cooldownUntil;
  }
  return { usedToday: s.dayCount, models, modelsLeft, blocked, readyAt };
}

export function onAIUsageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Throws a friendly error when Google has asked us to wait. */
export function assertCanUseAI() {
  const status = getAIUsage();
  if (!status.blocked) return;
  const seconds = Math.max(1, Math.ceil((status.readyAt - Date.now()) / 1000));
  const error = new Error(
    status.blocked === "day"
      ? "Today's free AI allowance is used up on every model. It resets at midnight."
      : `The free AI asked us to slow down. Try again in ${seconds} seconds.`
  );
  error.retryAfter = status.blocked === "day" ? null : seconds;
  error.localLimit = true;
  throw error;
}

/** Count one request to Gemini (for the "requests today" figure). */
export function recordAIRequest() {
  current().dayCount += 1;
  save();
}

/** Every model said "slow down": wait this long before the next try. */
export function setAICooldown(seconds) {
  current().cooldownUntil = Date.now() + Math.max(5, seconds || 60) * 1000;
  save();
}

/** A model's daily free allowance is gone; skip it until tomorrow. */
export function markModelUsedUp(name) {
  const s = current();
  if (!s.usedUpModels.includes(name)) {
    s.usedUpModels = [...s.usedUpModels, name];
    save();
  }
}

export function isModelUsedUp(name) {
  return current().usedUpModels.includes(name);
}
