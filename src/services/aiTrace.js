/**
 * Pipeline trace for the AI page: every step of one request (prompt
 * building, each model attempt, parsing, song matching) with its exact
 * input, prompt, config, raw reply, timing and error.
 *
 * Only collected in debug mode: REACT_APP_AI_DEBUG=true, or by default under
 * `npm start`. Set REACT_APP_AI_DEBUG=false to turn it off in development.
 * Outside debug mode the trace keeps only step names, models, timing and
 * status (no prompts, raw replies or internal error text).
 *
 * Keys never reach the browser (the NVIDIA key is added by the proxy), but
 * anything that looks like a credential is scrubbed anyway.
 */
export const AI_DEBUG = process.env.REACT_APP_AI_DEBUG
  ? process.env.REACT_APP_AI_DEBUG === "true"
  : process.env.NODE_ENV === "development";

const SECRET = /(Bearer\s+)[\w.-]+|nvapi-[\w-]+|AIza[\w-]{20,}|("?(?:api[_-]?key|authorization|x-goog-api-key|x-firebase-appcheck|token)"?\s*[:=]\s*"?)[^",\s}]+/gi;

function scrub(value) {
  if (typeof value === "string") return value.replace(SECRET, (m, bearer, key) => `${bearer || key || ""}[redacted]`);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  return value;
}

const DEBUG_ONLY = ["input", "prompt", "config", "raw", "parsed", "output", "request", "notes", "usage", "finishReason"];

/**
 * trace.step({...}) starts a step and returns { ok(out), fail(err), skip(why), note(text) }.
 * `meta` describes the whole run (kind, chosen model, iteration...).
 */
export function createTrace(meta = {}) {
  const started = Date.now();
  const trace = { id: `${started}-${Math.random().toString(36).slice(2, 7)}`, ...meta, startedAt: started, steps: [] };
  trace.step = (info) => {
    const step = { n: trace.steps.length + 1, status: "running", startedAt: Date.now(), ...info };
    trace.steps.push(step);
    const end = (status, extra) => {
      step.status = status;
      step.endedAt = Date.now();
      step.duration = step.endedAt - step.startedAt;
      Object.assign(step, extra);
    };
    return {
      ok: (extra = {}) => end("ok", extra),
      fail: ({ errorType, message, retryable, next, ...extra } = {}) => end("failed", { ...extra, error: { errorType, message, retryable, next } }),
      skip: (why) => end("skipped", { error: { errorType: "SKIPPED", message: why, retryable: false } }),
      note: (text) => { step.notes = [...(step.notes || []), text]; },
    };
  };
  /** Runs fn as a step: its return value is the step output. */
  trace.run = async (info, fn) => {
    const s = trace.step(info);
    try {
      const out = await fn();
      s.ok({ output: out });
      return out;
    } catch (error) {
      s.fail({ errorType: error?.errorType || "UNKNOWN", message: error?.message, retryable: true });
      throw error;
    }
  };
  return trace;
}

/** A plain, scrubbed copy of the trace (debug fields removed outside debug mode). */
export function finishTrace(trace, status = "ok") {
  if (!trace) return null;
  const endedAt = trace.endedAt || Date.now();
  const steps = trace.steps.map((s) => {
    const copy = { ...s };
    if (!AI_DEBUG) {
      DEBUG_ONLY.forEach((k) => delete copy[k]);
      if (copy.error) copy.error = { errorType: copy.error.errorType, retryable: copy.error.retryable };
    }
    return copy;
  });
  const { step, run, ...rest } = trace;
  return scrub({ ...rest, debug: AI_DEBUG, status, endedAt, duration: endedAt - trace.startedAt, steps });
}
