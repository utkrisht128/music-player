/**
 * AI song finder. The pipeline, one step at a time:
 *
 *   1. Photo    a quick vision model describes the photo: who is in it (look,
 *               pose, expression), the setting, what is happening, the mood.
 *   2. Filters  story/post/playlist plus language, era, energy.
 *   3. Prompt   built from 1 + 2 + the listener's own words (buildSongPrompt).
 *   4. Review   the listener sees the prompt and can edit it before sending.
 *   5. Songs    the song model (Kimi first) gets the prompt as text and
 *               returns songs, each with a ready YouTube search query.
 *   6. Match    each song is looked up (free index first, then YouTube) and
 *               the result is checked: right title and artist, official
 *               upload, not a cover/remix/slowed version.
 *
 * Models come from aiModels.js (NVIDIA through our proxy, Gemini through
 * Firebase AI Logic). YouTube searches cost 100 quota units each, so they
 * are capped per request.
 */
import { app, isFirebaseConfigured } from "./firebase";
import { isYouTubeConfigured, searchYouTube, searchYouTubeCatalog } from "./musicService";
import { assertCanUseAI, isModelUsedUp, markModelUsedUp, recordAIRequest, setAICooldown } from "./aiUsage";
import { AUTO, PHOTO_MODELS, getModelInfo, modelChain } from "./aiModels";
import { getNvidiaModel, nvidiaSystemPrompt } from "./nvidiaAI";
import { AI_DEBUG, createTrace, finishTrace } from "./aiTrace";

const MAX_YOUTUBE_LOOKUPS = 8;
/**
 * Auto tries models one after another. The first model gets its own full
 * wait (Kimi can queue for minutes); backups get at most FALLBACK_ATTEMPT_MS
 * each, within what is left of the total budget.
 */
const AUTO_BUDGET_MS = 180000;
const FALLBACK_ATTEMPT_MS = 75000;
const MIN_ATTEMPT_MS = 15000;

export const isAIConfigured = isFirebaseConfigured;

// ---------------------------------------------------------------------------
// Prompt helper options. `value` is what the AI is told; `label` is shown.
// ---------------------------------------------------------------------------
const THIS_YEAR = new Date().getFullYear();

export const FILTERS = {
  language: {
    label: "Language",
    options: [
      { id: "any", label: "Any" },
      { id: "hindi", label: "Hindi", value: "Hindi songs" },
      { id: "english", label: "English", value: "English songs" },
      { id: "punjabi", label: "Punjabi", value: "Punjabi songs" },
      { id: "mix", label: "Hindi + English", value: "a mix of Hindi and English songs" },
    ],
  },
  industry: {
    label: "Music from",
    options: [
      { id: "any", label: "Anywhere" },
      { id: "bollywood", label: "Bollywood", value: "Bollywood film songs" },
      { id: "hollywood", label: "Hollywood / Western", value: "Western/Hollywood pop, rock and hip-hop" },
      { id: "indie", label: "Indie", value: "independent (non-film) artists" },
    ],
  },
  era: {
    label: "When",
    options: [
      { id: "any", label: "Any time" },
      { id: "latest", label: "Latest", value: `released ${THIS_YEAR - 2} or later` },
      { id: "2010s", label: "2010s", value: "released 2010–2019" },
      { id: "2000s", label: "2000s", value: "released 2000–2009" },
      { id: "90s", label: "90s", value: "released 1990–1999" },
      { id: "classic", label: "Old classics", value: "old classics released before 1990" },
      { id: "custom", label: "Pick years…" },
    ],
  },
  energy: {
    label: "Energy",
    options: [
      { id: "any", label: "Any" },
      { id: "calm", label: "Calm", value: "calm, slow and soothing" },
      { id: "chill", label: "Chill", value: "relaxed mid-tempo" },
      { id: "upbeat", label: "Upbeat", value: "upbeat and energetic" },
      { id: "party", label: "Party", value: "high-energy dance/party" },
    ],
  },
};

export const MIN_YEAR = 1950;
export const MAX_YEAR = THIS_YEAR;
export const DEFAULT_FILTERS = { language: "any", industry: "any", era: "any", energy: "any", from: 2000, to: THIS_YEAR };

/** The chosen filters as plain-English rules for the AI (and the preview). */
export function describeFilters(filters = DEFAULT_FILTERS) {
  const pick = (key) => FILTERS[key].options.find((o) => o.id === filters[key]);
  const rules = [];
  ["language", "industry", "energy"].forEach((key) => {
    const option = pick(key);
    if (option?.value) rules.push(option.value);
  });
  if (filters.era === "custom") {
    const from = Math.min(filters.from, filters.to);
    const to = Math.max(filters.from, filters.to);
    rules.push(`released between ${from} and ${to}`);
  } else if (pick("era")?.value) {
    rules.push(pick("era").value);
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
let sdkPromise = null;
const sdk = () => {
  if (!sdkPromise) {
    sdkPromise = import("firebase/ai").then((mod) => ({ mod, ai: mod.getAI(app, { backend: new mod.GoogleAIBackend() }) }));
  }
  return sdkPromise;
};

// The JSON shape for NVIDIA models (Gemini gets the same thing as a Schema).
const JSON_SHAPES = {
  helper: `{"prompt": string}`,
  scene: `{
  "people": [{"age": "baby" | "toddler" | "child" | "teen" | "young adult" | "adult" | "older adult",
              "who": string, "look": string, "pose": string, "expression": string}],
  "setting": string, "weather": string, "activity": string, "story": string, "colors": string, "mood": string, "vibe": string
}`,
  songs: `{
  "vibe": string, "name": string, "description": string,
  "songs": [{"title": string, "artist": string, "film": string, "year": integer, "language": string,
             "popularity": integer 0-100, "search": string,
             "hookStart": integer seconds, "hookEnd": integer seconds, "hookLine": string, "why": string}]
}`,
};

const models = {};
async function getModel(kind, modelName) {
  const cacheKey = `${kind}:${modelName}`;
  const info = getModelInfo(modelName);
  if (!models[cacheKey] && info.provider === "nvidia") {
    models[cacheKey] = getNvidiaModel(info, JSON_SHAPES[kind]);
  }
  if (!models[cacheKey]) {
    const { mod, ai } = await sdk();
    const { Schema } = mod;
    const S = Schema.string;
    const schemas = {
      helper: () => Schema.object({ properties: { prompt: S() } }),
      scene: () => Schema.object({
        properties: {
          people: Schema.array({ items: Schema.object({ properties: { age: S(), who: S(), look: S(), pose: S(), expression: S() }, optionalProperties: ["age"] }) }),
          setting: S(), weather: S(), activity: S(), story: S(), colors: S(), mood: S(), vibe: S(),
        },
        optionalProperties: ["people", "colors", "weather"],
      }),
      songs: () => Schema.object({
        properties: {
          vibe: S(),
          name: S(),
          description: S(),
          songs: Schema.array({
            items: Schema.object({
              properties: {
                title: S(), artist: S(), film: S(), year: Schema.integer(), language: S(),
                popularity: Schema.integer(), search: S(),
                hookStart: Schema.integer(), hookEnd: Schema.integer(), hookLine: S(), why: S(),
              },
              optionalProperties: ["film", "hookLine", "hookEnd", "language"],
            }),
          }),
        },
      }),
    };
    const schema = schemas[kind]();
    models[cacheKey] = mod.getGenerativeModel(ai, {
      model: modelName,
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    });
  }
  return models[cacheKey];
}

/**
 * Everything Google told us about a failure: the message plus the structured
 * details (quota ids like "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
 * only appear there, not in the message).
 */
function errorText(error) {
  let details = "";
  try {
    details = JSON.stringify(error?.customErrorData || error?.cause?.customErrorData || "");
  } catch { /* circular: ignore */ }
  return `${error?.message || ""} ${details}`;
}

const isOverloaded = (text) => /high demand|overloaded|unavailable|\[50[03]|"status":50[03]/i.test(text);
const isRateLimited = (text) => /exceeded|quota|429|exhausted|rate limit/i.test(text);
const isDailyLimit = (text) => /PerDay|per.?day|daily/i.test(text);
const isTimeout = (text) => /timed out/i.test(text);
const isBadRequest = (text) => /rejected the request \[4\d\d/i.test(text);
/** Answered, but not with usable JSON: the next model may do better. */
const isInvalidReply = (text) => /\[invalid reply\]/i.test(text);
const isMissingModel = (text) => /not found|404|no longer available/i.test(text);

/** Gemini says how long to wait, e.g. "Please retry in 41.2s". */
function retryAfterSeconds(text) {
  const match = /retry in ([\d.]+)\s*s/i.exec(text) || /"retryDelay":\s*"(\d+)s"/.exec(text);
  return match ? Math.ceil(Number(match[1])) : null;
}

/** Gemini's SDK has no per-call timeout: give up on our side (the chain moves on). */
function withTimeout(promise, ms, label) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`), { errorType: "TIMEOUT" })), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/** One quick retry for "high demand", which usually clears within seconds. */
async function withRetry(fn, attempts = 2, step = null) {
  for (let i = 1; ; i += 1) {
    recordAIRequest();
    try {
      return await fn();
    } catch (error) {
      if (!isOverloaded(errorText(error)) || i >= attempts) throw error;
      step?.note(`Attempt ${i} overloaded (${error?.message}); retrying in 2.5s`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

/**
 * A carousel has several photos, but some models take only one: stitch the
 * extras into a single grid so the model still sees every slide.
 */
async function fitImages(parts, maxImages) {
  if (!Array.isArray(parts)) return parts;
  const images = parts.filter((p) => p?.inlineData);
  if (images.length <= maxImages) return parts;
  const collage = await makeCollage(images.map((p) => p.inlineData));
  return [{ inlineData: collage }, ...parts.filter((p) => !p?.inlineData)];
}

function makeCollage(images, cell = 512) {
  const cols = Math.ceil(Math.sqrt(images.length));
  const rows = Math.ceil(images.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return Promise.all(images.map((img, i) => new Promise((resolve) => {
    const el = new Image();
    el.onload = () => {
      // Fit (not crop) each slide into its cell.
      const scale = Math.min(cell / el.width, cell / el.height);
      const w = el.width * scale;
      const h = el.height * scale;
      ctx.drawImage(el, (i % cols) * cell + (cell - w) / 2, Math.floor(i / cols) * cell + (cell - h) / 2, w, h);
      resolve();
    };
    el.onerror = resolve;
    el.src = `data:${img.mimeType};base64,${img.data}`;
  }))).then(() => ({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], mimeType: "image/jpeg" }));
}

/**
 * Runs one request down the model chain. Each model has its own free
 * allowance, so any "can't right now" from one (daily limit, per-minute
 * limit, overloaded, retired) hands over to the next. Only when every model
 * refuses does the listener see an error.
 */
/** Checks a parsed reply has what the caller needs; throws an [invalid reply] otherwise. */
const VALIDATE = {
  helper: (data) => typeof data?.prompt === "string" && data.prompt.trim(),
  scene: (data) => Boolean(data && (data.setting || data.story || data.mood || data.people?.length)),
  songs: (data) => Array.isArray(data?.songs) && data.songs.some((s) => s?.title),
};

/** Error category for the pipeline inspector. */
function classifyError(error, text) {
  if (error?.errorType) return error.errorType;
  if (isInvalidReply(text)) return "PARSING";
  if (isTimeout(text)) return "TIMEOUT";
  if (isRateLimited(text)) return "RATE_LIMIT";
  if (/app.?check|401|unauthenticated/i.test(text)) return "AUTHENTICATION";
  if (isOverloaded(text) || isMissingModel(text) || isBadRequest(text)) return "MODEL_API_ERROR";
  return "UNKNOWN";
}

/** Parses the model's text as JSON and checks its shape. */
function parseReply(kind, label, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw Object.assign(new Error(`${label} returned no JSON [invalid reply]: ${e.message}`), { errorType: "PARSING" });
  }
  if (!VALIDATE[kind](data)) {
    throw Object.assign(new Error(`${label} returned JSON without the expected fields [invalid reply]`), { errorType: "MODEL_RESPONSE", parsed: data });
  }
  return data;
}

/**
 * Runs one request down the model chain. Each model has its own free
 * allowance, so any "can't right now" from one (daily limit, per-minute
 * limit, overloaded, retired, or an unusable reply) hands over to the next.
 * Only when every model refuses does the listener see an error.
 *
 * Parsing happens here (not in the caller) so a malformed reply falls
 * through to the next model. Every attempt is one step in `trace`.
 * `single: true` tries only the chosen model (for testing one model).
 */
async function runAI(kind, parts, { model: chosen = AUTO, single = false, trace = null, chain: fixedChain = null, onProgress } = {}) {
  assertCanUseAI();
  let lastError = null;
  let shortestWait = null;
  const hasImage = Array.isArray(parts) && parts.some((p) => p?.inlineData);
  const userText = typeof parts === "string" ? parts : parts.filter((p) => typeof p === "string").join("\n");
  const chain = fixedChain || (single && chosen !== AUTO ? [chosen] : modelChain(chosen, { needsVision: hasImage, forSongs: kind === "songs" }));
  // The first model always gets its full wait (it is the one the listener
  // picked, or Kimi in Auto); the backups share the rest of the budget.
  const firstTimeout = getModelInfo(chain[0])?.timeoutMs || 90000;
  const deadline = single ? Infinity : Date.now() + Math.max(AUTO_BUDGET_MS, firstTimeout + FALLBACK_ATTEMPT_MS);
  for (const [index, name] of chain.entries()) {
    const info = getModelInfo(name);
    const ownTimeout = info.timeoutMs || (info.provider === "nvidia" ? 90000 : 60000);
    const timeoutMs = index === 0 || single ? ownTimeout : Math.min(ownTimeout, deadline - Date.now(), FALLBACK_ATTEMPT_MS);
    const step = trace?.step({
      timeoutMs: Number.isFinite(timeoutMs) ? Math.max(0, Math.round(timeoutMs)) : ownTimeout,
      name: `Model: ${info.label}`,
      type: "model",
      model: name,
      provider: info.provider,
      input: { kind, images: hasImage ? parts.filter((p) => p?.inlineData).length : 0 },
      prompt: {
        system: info.provider === "nvidia" ? nvidiaSystemPrompt(JSON_SHAPES[kind]) : "(none: Gemini gets a JSON responseSchema instead)",
        user: userText,
      },
      config: info.provider === "nvidia"
        ? { model: name, temperature: info.temperature ?? 0.7, max_tokens: info.maxTokens || 3000, response_format: info.jsonMode ? "json_object" : "text", maxImages: info.maxImages || 1 }
        : { model: name, responseMimeType: "application/json", responseSchema: kind, maxImages: info.maxImages || 10 },
    });
    if (timeoutMs < MIN_ATTEMPT_MS) {
      step?.skip(`Auto's ${AUTO_BUDGET_MS / 1000}s time budget is used up; not tried.`);
      continue; // eslint-disable-line no-continue
    }
    if (isModelUsedUp(name)) {
      step?.skip("Used up for today (daily limit or retired); skipped until midnight.");
      continue; // eslint-disable-line no-continue
    }
    let result = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      const model = await getModel(kind, name);
      // eslint-disable-next-line no-await-in-loop
      const input = await fitImages(parts, info.maxImages || 1);
      onProgress?.({ model: name, label: info.label, phase: "queued", attempt: index + 1 });
      const progress = (phase) => onProgress?.({ model: name, label: info.label, phase, attempt: index + 1 });
      // NVIDIA streams and enforces its own first-token/idle limits; Gemini's SDK has none.
      const call = () => (info.provider === "nvidia"
        ? model.generateContent(input, { timeoutMs, onProgress: progress })
        : withTimeout(model.generateContent(input), timeoutMs, info.label));
      // eslint-disable-next-line no-await-in-loop
      result = await withRetry(call, 2, step);
      const text = result.response.text();
      const data = parseReply(kind, info.label, text);
      step?.ok({ http: result.status ?? 200, raw: result.raw ?? text, parsed: data, finishReason: result.finishReason, usage: result.usage || result.response?.usageMetadata, request: result.request });
      return { text, data, model: name };
    } catch (error) {
      const text = errorText(error);
      const errorType = classifyError(error, text);
      // eslint-disable-next-line no-console
      console.warn(`AI model ${name} failed (${errorType}), trying the next one:`, error?.message);
      let next = "tried next model";
      if (isDailyLimit(text) || (isMissingModel(text) && !isInvalidReply(text))) {
        markModelUsedUp(name);
        next = "marked used up for today; tried next model";
      } else if (isRateLimited(text)) {
        const wait = retryAfterSeconds(text) || 60;
        shortestWait = shortestWait == null ? wait : Math.min(shortestWait, wait);
      } else if (!isOverloaded(text) && !isTimeout(text) && !isBadRequest(text) && !isInvalidReply(text)) {
        next = "stopped: not a model-availability problem";
      }
      step?.fail({
        errorType,
        message: error?.message || String(error),
        retryable: next !== "stopped: not a model-availability problem",
        next,
        http: error?.status ?? result?.status,
        raw: error?.raw ?? result?.raw ?? (error?.customErrorData ? JSON.stringify(error.customErrorData) : undefined),
        parsed: error?.parsed,
        request: error?.request ?? result?.request,
      });
      if (next.startsWith("stopped")) {
        error.trace = trace; // eslint-disable-line no-param-reassign
        throw error; // a real problem (App Check, bad photo…): don't hide it
      }
      lastError = error;
    }
  }
  // Every model is busy for the minute: pause until the soonest is free.
  if (shortestWait != null) setAICooldown(shortestWait);
  try {
    assertCanUseAI(); // throws "used up today" when that's why we got here
  } catch (limit) {
    limit.trace = trace;
    throw limit;
  }
  const error = lastError || new Error("No AI model is available right now.");
  error.trace = trace;
  throw error;
}

function friendlyError(cause, fallback, trace = cause?.trace) {
  if (cause?.localLimit) {
    if (trace) cause.trace = finishTrace(trace, "failed"); // eslint-disable-line no-param-reassign
    return cause; // already friendly
  }
  // eslint-disable-next-line no-console
  console.error("AI request failed", cause);
  const text = errorText(cause);
  const wait = retryAfterSeconds(text);
  let message = fallback;
  if (isTimeout(text)) {
    message = "The free AI model took too long to answer. Try again, or pick another model.";
  } else if (isBadRequest(text)) {
    message = `The AI model couldn't handle this request (${(cause?.message || "").replace(/^.*?]:\s*/, "").slice(0, 120)}). Try another model.`;
  } else if (/app.?check|401|unauthenticated/i.test(text)) {
    message = "This site couldn't be verified (App Check). If you're the owner, see the setup notes.";
  } else if (isOverloaded(text)) {
    message = "The AI is overloaded right now (not your fault). Try again in a few seconds.";
  } else if (isRateLimited(text)) {
    message = wait ? `The free AI asked us to slow down. Try again in ${wait} seconds.` : "The free AI asked us to slow down. Try again in a minute.";
  } else if (/api.*not.*enabled|403|permission/i.test(text)) {
    message = "AI playlists aren't enabled for this site yet.";
  } else if (isInvalidReply(text)) {
    message = "The AI answered, but not in a format we could read. Try again, or pick another model.";
  } else if (/image|inline|mime/i.test(cause?.message || "")) {
    message = "Couldn't read that photo. Try a different one.";
  }
  const error = new Error(message);
  error.retryAfter = wait;
  error.cause = cause;
  if (trace) error.trace = finishTrace(trace, "failed");
  return error;
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------

/**
 * Turns a rough idea ("sad song for rain") into a clear, specific request,
 * written in the listener's voice so it can be edited and sent as is.
 */
export async function improvePrompt(text, filters = DEFAULT_FILTERS, { hasImage = false, model = AUTO, onTrace } = {}) {
  const trace = createTrace({ kind: "helper", label: "Improve prompt", chosenModel: model });
  const rules = describeFilters(filters);
  const idea = text.trim() || (hasImage ? "songs that match my photo" : "some good songs");
  const instruction = `Help a music listener write a better request for an AI that suggests songs.
Their rough idea (may be informal or Hinglish): "${idea}".
${rules.length ? `Their preferences: ${rules.join("; ")}.` : ""}
${hasImage ? "They will also attach a photo, so the request can refer to \"this photo\"." : ""}
Rewrite it as ONE friendly first-person request in simple everyday English, 1–2 sentences, max 40 words.
Make it specific: the mood or moment, and the kind of songs (language, era, energy) where known.
Don't list song names. Don't invent preferences they didn't imply.`;
  trace.step({ name: "Prompt construction", type: "prompt", input: { idea: text, filters, hasImage } }).ok({ output: instruction });
  try {
    const { data } = await runAI("helper", instruction, { model, trace });
    const better = String(data.prompt || "").trim();
    onTrace?.(finishTrace(trace));
    return better;
  } catch (cause) {
    const error = friendlyError(cause, "Couldn't improve the prompt right now. Please try again.", trace);
    onTrace?.(error.trace);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 1: read the photo
// ---------------------------------------------------------------------------

/** How long a music clip Instagram lets you pick, per format. */
export const POST_FORMATS = {
  story: { label: "Story", clip: 15, hint: "15-second clip" },
  post: { label: "Post", clip: 30, hint: "30-second clip" },
};
export const MAX_CAROUSEL = 10;

function scenePrompt(imageCount) {
  const many = imageCount > 1;
  return `${many ? `These ${imageCount} photos are one Instagram carousel, in order (if they arrive as a grid, read it left-to-right, top-to-bottom).` : "Look at this photo."}
Describe only what you can actually see, in plain simple English. Someone will choose background music from your description, so getting WHO is in it and the real feeling right matters most.
Fill:
- people: one entry per visible person (max 4).
  age: pick one of baby (under 1), toddler (1–3), child (4–12), teen, young adult, adult, older adult. Judge from face and body size; small children are easy to mistake for older kids.
  who: short description ("toddler in a bear-ear hood", "couple in their 20s", "grandmother").
  look: clothes, colours and details ("pink puffy snowsuit, grey fur hood with little ears, blue glove in hand").
  pose: body language ("standing, arms out, holding a glove").
  expression: the face as it really is ("curious wide eyes", "shy smile", "serious", "laughing"). Do not say happy unless they are smiling.
  Empty list if there are no people.
- setting: the place and background ("snowy meadow with hills and bare trees").
- weather: season, weather and time of day ("sunny winter morning, fresh snow").
- activity: what is VISIBLY happening ("standing in the snow on a family trip"). Do not invent events that aren't shown (no "made a snowman" unless a snowman is in the photo).
- story: one sentence on the moment, as a parent or friend would caption it, without inventing anything.
- colors: the light and colours ("bright blue sky, white snow, pink outfit").
- mood: 2–4 words for the overall feeling (e.g. "cute, curious, wintry").
- vibe: one short friendly sentence summing it up.
Don't guess names.
Reply with ONLY this JSON object, nothing before or after it (small vision models skip the system prompt when a photo is attached):
${JSON_SHAPES.scene}`;
}

/**
 * Step 1: a quick vision model describes the photo(s). Returns
 * { scene, model, trace }. The song model later gets this text instead of
 * the photo, so every model (text-only ones too) can pick songs for it.
 */
export async function analyzePhotos(images, { onProgress } = {}) {
  if (!images.length) throw new Error("Add a photo first.");
  const trace = createTrace({ kind: "scene", label: "Read the photo", chosenModel: AUTO });
  const text = scenePrompt(images.length);
  trace.step({ name: "Photo prompt", type: "prompt", input: { images: images.length } }).ok({ output: text });
  try {
    const parts = [...images.map((img) => ({ inlineData: { data: img.data, mimeType: img.mimeType } })), text];
    const reply = await runAI("scene", parts, { chain: PHOTO_MODELS, trace, onProgress });
    return { scene: cleanScene(reply.data), model: reply.model, trace: finishTrace(trace) };
  } catch (cause) {
    throw friendlyError(cause, "Couldn't read the photo right now. Please try again.", trace);
  }
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

function cleanScene(data) {
  return {
    people: (Array.isArray(data.people) ? data.people : [])
      .filter((p) => p && (p.who || p.look || p.pose || p.expression))
      .slice(0, 4)
      .map((p) => ({ age: str(p.age), who: str(p.who), look: str(p.look), pose: str(p.pose), expression: str(p.expression) })),
    setting: str(data.setting),
    weather: str(data.weather),
    activity: str(data.activity),
    story: str(data.story),
    colors: str(data.colors),
    mood: str(data.mood),
    vibe: str(data.vibe),
  };
}

// ---------------------------------------------------------------------------
// Step 2 + 3: filters and the listener's words -> the prompt
// ---------------------------------------------------------------------------

function describeScene(scene) {
  const lines = [];
  scene.people.forEach((p, i) => {
    const bits = [p.age && p.who && !p.who.toLowerCase().includes(p.age) ? `${p.who} (${p.age})` : p.who || p.age, p.look && `wearing ${p.look}`, p.pose && `pose: ${p.pose}`, p.expression && `expression: ${p.expression}`].filter(Boolean);
    lines.push(`- Person ${i + 1}: ${bits.join("; ")}`);
  });
  if (!scene.people.length) lines.push("- No people in the photo");
  [["Setting", scene.setting], ["Weather and time", scene.weather], ["What's happening", scene.activity], ["The moment", scene.story], ["Light and colours", scene.colors], ["Mood", scene.mood]]
    .forEach(([label, value]) => { if (value) lines.push(`- ${label}: ${value}`); });
  return lines.join("\n");
}

const CHILD_AGES = /^(baby|toddler|child)$/i;
const CHILD_WORDS = /\b(baby|babies|toddler|kid|kids|child|children|son|daughter|beta|beti|bach+a|bach+i|bachch?[ae]|munn[ai]|little one|nephew|niece|cute (boy|girl))\b/i;

/**
 * Who the song is for changes what fits: a toddler in the snow should never
 * get an item song or a love duet, however big a hit it is. Read from the
 * photo (people's age) and the listener's words.
 */
function audienceRules(scene, request) {
  const people = scene?.people || [];
  const child = people.some((p) => CHILD_AGES.test(p.age) || /\b(baby|toddler|little (boy|girl)|kid|child)\b/i.test(p.who)) || CHILD_WORDS.test(request);
  if (child) {
    return ["a small child is the star: songs must feel innocent and sweet, about childhood, wonder, play, fun or family love (songs from family or children's films, playful happy songs, lori). NEVER romantic, love-duet, heartbreak, item, club, drinking or sensual songs, even if they are big hits"];
  }
  if (people.some((p) => /older adult/i.test(p.age))) return ["an older person is in the photo: warm, respectful, family or nostalgic songs; nothing crude or clubby"];
  return [];
}

/**
 * The full prompt for the song model, in labelled sections so it is easy to
 * read and edit in the prompt window. Hard rules (filters) are separated from
 * soft hints (taste) so the model knows which ones it must not break.
 */
export function buildSongPrompt({
  request = "", scene = null, filters = DEFAULT_FILTERS, forPost = false, format = "story", imageCount = 1,
  count = 10, exclude = [], feedback = "", tasteTracks = [],
} = {}) {
  const rules = describeFilters(filters);
  const post = forPost ? POST_FORMATS[format] : null;
  const what = post
    ? `the background song for an Instagram ${imageCount > 1 ? "carousel post" : post.label.toLowerCase()}`
    : "a playlist";
  const sections = [
    `You are a music supervisor who picks ${forPost ? "songs for Instagram stories and posts" : "songs for playlists"}. Pick ${what}.`,
  ];
  if (scene) sections.push(`## The photo\n${describeScene(scene)}`);
  sections.push(`## What the listener says\n${request.trim()
    ? `"${request.trim()}"\n(Their own words, maybe informal or Hinglish. This matters most: it can tell you the occasion or feeling the photo can't.)`
    : scene ? "Nothing: match the photo." : "Nothing specific: make a great mix."}`);
  const must = [...audienceRules(scene, request), ...rules];
  if (scene?.setting || scene?.weather) must.push("let the setting and weather shape the sound too: the song should feel like it belongs in that place");
  if (post) must.push(`it's for an Instagram ${post.label.toLowerCase()}: the best ${post.clip}-second part must fit the ${scene ? "photo" : "moment"} on its own`);
  if (feedback.trim()) must.push(`feedback on the last suggestions: "${feedback.trim()}"`);
  if (must.length) sections.push(`## Must follow\n${must.map((r) => `- ${r}`).join("\n")}`);
  if (tasteTracks.length) {
    sections.push(`## Their taste (light hint only)\nRecently enjoyed: ${tasteTracks.slice(0, 12).map((t) => `"${t.title}" by ${(t.artists || []).join(", ")}`).join("; ")}.`);
  }
  if (exclude.length) sections.push(`## Already suggested (don't repeat)\n${exclude.slice(0, 60).join("; ")}`);
  sections.push(`## Task
Suggest exactly ${count} songs whose feeling matches ${scene ? "the people, the setting and the moment in the photo" : "the request"}${request.trim() ? " and what the listener says" : ""}.
Order: best fit first${forPost ? "; among equally good fits, prefer well-known songs people recognise on Instagram" : ""}.
Only real, officially released songs that are on YouTube. If you are not sure a song exists with that exact title and artist, leave it out.
For each song:
- title: the official title only (no "(Official Video)", no film name)
- artist: the main singer or band
- film: the film or album for film songs, else ""
- year, language
- popularity: 0–100 (100 = massive hit everyone knows, 50 = well known, 20 = niche)
- search: the YouTube search that finds the ORIGINAL official audio, as "<title> <artist> <film if any> official audio"
- hookStart${post ? " / hookEnd" : ""}: seconds where the most recognisable part (usually the chorus or drop) starts${post ? `; hookEnd = hookStart + about ${post.clip}` : ""}
- hookLine: the first line sung there, in its original language
- why: one short simple sentence on why it fits${scene ? " this photo" : ""}
No covers, remixes, slowed/reverb, lofi or mashup versions unless asked. No duplicates.
Before answering, check every song: does it suit WHO is in the photo and the "Must follow" list? Are the singers right for this exact song and film? Is hookStart the real chorus time (few songs start with the chorus at 0)? Replace any song that fails.
Also give "vibe" (one friendly sentence on the feeling you went for), "name" (max 5 words) and "description" (one sentence).`);
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Step 6: find each song on YouTube, and check it is the right one
// ---------------------------------------------------------------------------

const clamp = (value, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** How to describe a popularity score to a listener. */
export function popularityLabel(score) {
  if (score >= 85) return { text: "Mega hit", tone: "mega" };
  if (score >= 65) return { text: "Big hit", tone: "big" };
  if (score >= 40) return { text: "Popular", tone: "popular" };
  return { text: "Hidden gem", tone: "gem" };
}

const fold = (text) => String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const wordsOf = (text) => fold(text).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
const WRONG_VERSION = /\b(cover|remix|slowed|reverb|lo ?fi|8d|karaoke|instrumental|reaction|mashup|sped up|nightcore|ringtone|whatsapp status|tutorial|piano|guitar lesson|dance video|lyrics? meaning|unplugged|live|jukebox)\b/;
const OFFICIAL_CHANNEL = /( - topic$|vevo|official|records|music$|t-series|sony music|zee music|saregama|tips|yrf|speed records|white hill|eros now|times music|desi music factory)/i;

/**
 * How well a YouTube track matches a suggested song (0 = wrong song).
 * Title words must mostly match; the artist, an official channel and the
 * absence of "cover/remix/slowed" push the original to the top.
 */
function matchScore(track, song) {
  const want = wordsOf(song.title);
  if (!want.length) return 0;
  const haystack = ` ${fold(`${track.title} ${track.albumTitle || ""}`)} `;
  const titleHit = want.filter((w) => haystack.includes(` ${w} `)).length / want.length;
  if (titleHit < 0.6) return 0;
  const credits = fold(`${(track.artists || []).join(" ")} ${track.channel || ""} ${track.title}`);
  const artistWords = wordsOf(song.artist).filter((w) => w.length > 2);
  const artistHit = artistWords.length ? artistWords.filter((w) => credits.includes(w)).length / artistWords.length : 0.5;
  let score = titleHit * 3 + artistHit * 2;
  if (OFFICIAL_CHANNEL.test(track.channel || "")) score += 1;
  // A "remix" only counts against it when the listener didn't ask for one.
  const wrong = fold(track.title).match(WRONG_VERSION);
  if (wrong && !fold(song.title).includes(wrong[0])) score -= 3;
  return score;
}

function bestMatch(tracks, song, min = 3.5) {
  let best = null;
  tracks.forEach((track) => {
    const score = matchScore(track, song);
    if (score >= min && (!best || score > best.score)) best = { track, score };
  });
  return best?.track || null;
}

const searchFor = (song) => {
  const query = str(song.search);
  // The model's query, unless it forgot the title (then build our own).
  return query && wordsOf(song.title).every((w) => fold(query).includes(w))
    ? query
    : [song.title, song.artist, song.film, "official audio"].filter(Boolean).join(" ");
};

/** Why a candidate was turned down (for the log), or "" when it is acceptable. */
function rejectReason(track, song) {
  const want = wordsOf(song.title);
  const haystack = ` ${fold(`${track.title} ${track.albumTitle || ""}`)} `;
  const titleHit = want.filter((w) => haystack.includes(` ${w} `)).length / (want.length || 1);
  if (titleHit < 0.6) return "different title";
  const wrong = fold(track.title).match(WRONG_VERSION);
  if (wrong && !fold(song.title).includes(wrong[0])) return `${wrong[0]} version`;
  return "artist doesn't match";
}

/**
 * Looks one list of candidates over. Returns { track, candidates, closest }
 * where closest is the best rejected candidate and why it was rejected.
 */
function judge(tracks, song) {
  const track = bestMatch(tracks, song);
  if (track || !tracks.length) return { track, candidates: tracks.length, closest: null };
  const top = tracks[0];
  return { track: null, candidates: tracks.length, closest: { title: top.title, channel: top.channel, reason: rejectReason(top, song) } };
}

/**
 * A playable, checked track for each suggestion, plus a record of how it
 * was found: { track, via: "index" | "youtube" | null, query, candidates, closest, reason }.
 */
async function matchSongs(songs, note = () => {}) {
  const results = await Promise.all(songs.map(async (song) => {
    const query = `${song.title} ${song.artist}`;
    try {
      const { track, candidates, closest } = judge(await searchYouTubeCatalog(query, 8), song);
      return { track, via: track ? "index" : null, query, candidates, closest, reason: track ? "" : "not in the free song index" };
    } catch (e) {
      note(`Free index failed for "${song.title}": ${e?.message}`);
      return { track: null, via: null, query, candidates: 0, closest: null, reason: `free index error: ${e?.message}` };
    }
  }));
  // YouTube lookups run one at a time so a quota error stops the rest.
  let lookups = 0;
  let stopped = "";
  for (let i = 0; i < songs.length; i += 1) {
    if (results[i].track) continue;
    if (!isYouTubeConfigured()) { results[i].reason = "YouTube search isn't set up"; continue; }
    if (stopped) { results[i].reason = stopped; continue; }
    if (lookups >= MAX_YOUTUBE_LOOKUPS) { results[i].reason = `skipped: only ${MAX_YOUTUBE_LOOKUPS} YouTube searches per request (quota)`; continue; }
    lookups += 1;
    const query = searchFor(songs[i]);
    try {
      // eslint-disable-next-line no-await-in-loop
      const verdict = judge(await searchYouTube(query, { limit: 10 }), songs[i]);
      results[i] = {
        ...verdict,
        via: verdict.track ? "youtube" : null,
        query,
        reason: verdict.track ? "" : verdict.candidates ? `no result matched (closest: ${verdict.closest.reason})` : "YouTube found nothing",
      };
      note(`YouTube "${query}" → ${verdict.track ? `${verdict.track.title} · ${verdict.track.channel}` : results[i].reason}`);
    } catch (e) {
      stopped = `YouTube search stopped: ${e?.message}`;
      results[i].reason = stopped;
      note(`${stopped}; remaining songs left unmatched`);
    }
  }
  return results;
}

/** Song matching as a traced step (YouTube quota errors are recorded, not hidden). */
async function tracedMatch(trace, songs) {
  const step = trace.step({ name: "Find songs on YouTube", type: "match", provider: "youtube", input: songs.map((s) => `${s.title} – ${s.artist} [${searchFor(s)}]`) });
  try {
    const results = await matchSongs(songs, (note) => step.note(note));
    step.ok({ output: songs.map((s, i) => ({ song: `${s.title} – ${s.artist}`, via: results[i].via, match: results[i].track ? `${results[i].track.title} · ${results[i].track.channel}` : null, reason: results[i].reason || undefined })) });
    return results;
  } catch (error) {
    step.fail({ errorType: "BACKEND", message: error?.message, retryable: true });
    throw error;
  }
}


// ---------------------------------------------------------------------------
// Step 5: send the (reviewed) prompt and turn the reply into picks
// ---------------------------------------------------------------------------

/**
 * Sends `prompt` (exactly as reviewed) to the song model and finds every
 * suggestion on YouTube. `edited` marks a prompt the listener changed.
 * `onProgress({ stage, label, phase })` reports "model" (queued / thinking /
 * writing) and "match". Returns
 * { vibe, name, description, picks, tracks, suggested, missed, model, trace }.
 */
export async function findSongs(prompt, {
  count = 10, forPost = false, format = "story", model = AUTO, single = false, iteration = 1, edited = false, onProgress,
} = {}) {
  const trace = createTrace({ kind: forPost ? "post" : "playlist", label: forPost ? `Instagram ${POST_FORMATS[format].label}` : "Mood playlist", chosenModel: model, single, iteration });
  trace.prompt = { original: edited ? null : prompt, edited: edited ? prompt : null, sent: prompt };
  trace.step({ name: "Prompt (as reviewed)", type: "prompt", input: { count, forPost, format, edited } }).ok({ prompt: { user: prompt }, output: prompt });
  let plan;
  let answeredBy;
  try {
    const reply = await runAI("songs", prompt, { model, single, trace, onProgress: (p) => onProgress?.({ stage: "model", ...p }) });
    plan = reply.data;
    answeredBy = reply.model;
  } catch (cause) {
    throw friendlyError(cause, "Couldn't find songs right now. Please try again.", trace);
  }

  const songs = (plan.songs || []).filter((s) => s?.title).slice(0, count);
  onProgress?.({ stage: "match", count: songs.length });
  const matches = await tracedMatch(trace, songs);
  // One line per suggested song: what the AI said and what we found for it.
  const songLog = songs.map((song, i) => ({
    title: song.title, artist: song.artist, film: song.film || "", year: song.year || null, why: song.why || "",
    search: matches[i].query, via: matches[i].via, candidates: matches[i].candidates,
    found: matches[i].track ? { title: matches[i].track.title, channel: matches[i].track.channel, id: matches[i].track.id } : null,
    closest: matches[i].closest, reason: matches[i].reason,
  }));
  const clip = forPost ? POST_FORMATS[format].clip : 30;
  const seen = new Set();
  const picks = [];
  const missed = [];
  // Every song "at 0:00" (or all at one second) means the model guessed: use a
  // typical first-chorus time instead and mark it as estimated.
  const starts = songs.map((s) => Number(s.hookStart) || 0);
  const guessed = songs.length > 1 && (starts.every((t) => t < 10) || new Set(starts).size === 1);
  songs.forEach((song, i) => {
    const { track } = matches[i];
    if (!track) { missed.push(song); return; }
    if (seen.has(track.id)) return;
    seen.add(track.id);
    const hookEstimated = guessed || !(Number(song.hookStart) > 0);
    const hookStart = hookEstimated ? 50 : clamp(song.hookStart, 0, 600);
    const end = hookEstimated ? NaN : Number(song.hookEnd);
    // Keep the clip Instagram-sized even when the model's end is off.
    const hookEnd = Number.isFinite(end) && end > hookStart + 5 && end <= hookStart + clip * 2 ? Math.round(end) : hookStart + clip;
    picks.push({
      track,
      title: song.title,
      artist: song.artist,
      year: song.year || null,
      popularity: clamp(song.popularity, 0, 100),
      hookStart,
      hookEnd,
      hookEstimated,
      hookLine: hookEstimated ? "" : song.hookLine || "",
      why: song.why || "",
    });
  });

  return {
    vibe: plan.vibe || "",
    name: plan.name || (forPost ? "Songs for your post" : "AI Mix"),
    description: plan.description || "",
    picks,
    tracks: picks.map((p) => p.track),
    suggested: songs.map((s) => `${s.title} by ${s.artist}`),
    missed,
    songLog,
    model: answeredBy,
    trace: finishTrace(trace),
  };
}

/**
 * Shrinks a photo before upload: phone photos are often 5–10 MB, while the
 * AI needs ~1000px to read a mood. Returns { data, mimeType, previewUrl }.
 */
export function prepareImage(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ data: dataUrl.split(",")[1], mimeType: "image/jpeg", previewUrl: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't open that image. Try a JPG or PNG."));
    };
    img.src = url;
  });
}

export { AI_DEBUG };

// Debug mode only: lets a test harness (or the console) call the pipeline directly.
if (AI_DEBUG && typeof window !== "undefined") {
  window.__AI_DEBUG__ = { analyzePhotos, buildSongPrompt, findSongs, improvePrompt };
}
