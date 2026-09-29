/**
 * Every AI model the app can use, and how to talk to each one. The request
 * code reads these settings instead of hard-coding per-model behaviour, so a
 * new model is one entry here.
 *
 *  provider   "nvidia" (build.nvidia.com, through our proxy) or "gemini" (Firebase AI Logic)
 *  vision     can it look at photos?
 *  maxImages  photos per request; more (a carousel) are stitched into one collage
 *  jsonMode   send response_format: json_object (NVIDIA only)
 *  maxTokens  reply budget; reasoning models think first, so they need more
 *  timeoutMs  give up and move to the next model after this long
 *
 * In "Auto" the app tries them top to bottom; each has its own free
 * allowance, so when one is busy or used up the next takes over. Kimi comes
 * first (best song knowledge, answers once it leaves the queue); the 90B and
 * DeepSeek models were often queued without answering, so they come late.
 *
 * Photo reading is a separate, quick step (PHOTO_MODELS): a small vision
 * model describes the photo, and the song model gets that text, not the photo.
 */
import { readJSON, writeJSON } from "../utils/storage";

export const MODEL_CATALOG = [
  {
    // Measured on the free tier: 3–4 minutes in NVIDIA's queue before the
    // first token. Thinking is switched off (tested: it then answers straight
    // in JSON); the big token budget covers it if NVIDIA ignores that.
    id: "moonshotai/kimi-k3",
    label: "Kimi K3",
    provider: "nvidia",
    note: "Best picks · can queue 3–5 min",
    vision: true,
    maxImages: 1,
    jsonMode: false,
    maxTokens: 16000,
    temperature: 0.6,
    timeoutMs: 330000, // wait for the first token (queue)
    idleMs: 90000, // then give up only after this long with no data
    extraBody: { chat_template_kwargs: { thinking: false } },
  },
  {
    id: "meta/llama-3.2-11b-vision-instruct",
    label: "Llama 3.2 Vision",
    provider: "nvidia",
    note: "Fast · reads photos",
    songs: false, // reads photos well, but invents song credits and hook times
    vision: true,
    maxImages: 1,
    jsonMode: true,
    maxTokens: 1500,
    temperature: 0.7,
    timeoutMs: 90000, // free tier: a photo request takes 20–50s
  },
  {
    id: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    provider: "nvidia",
    note: "Good music knowledge · text only",
    vision: false,
    jsonMode: true,
    maxTokens: 6000,
    temperature: 0.6,
    timeoutMs: 90000,
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron 3 Nano Omni",
    provider: "nvidia",
    note: "Reads photos · thinks first",
    vision: true,
    maxImages: 1,
    jsonMode: false, // reasoning model: it writes its thinking before the JSON
    maxTokens: 6000,
    temperature: 0.6,
    timeoutMs: 150000,
  },
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    label: "Llama 3.2 90B Vision",
    provider: "nvidia",
    note: "Sharper photo reading · slower",
    songs: false,
    vision: true,
    maxImages: 1,
    jsonMode: true,
    maxTokens: 1500,
    temperature: 0.7,
    timeoutMs: 150000,
  },
  {
    id: "deepseek-ai/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    provider: "nvidia",
    note: "Strong · text only · often busy",
    vision: false,
    jsonMode: true,
    maxTokens: 6000,
    temperature: 0.6,
    timeoutMs: 90000,
  },
  ...(
    process.env.REACT_APP_GEMINI_MODELS
    || [process.env.REACT_APP_GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"].filter(Boolean).join(",")
  )
    .split(",")
    .map((m) => m.trim())
    .filter((m, i, all) => m && all.indexOf(m) === i)
    .map((id) => ({
      id,
      label: `Gemini ${id.replace(/^gemini-/, "").split("-").map((p) => (/^\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1))).join(" ")}`,
      provider: "gemini",
      note: "Google · reads photos · daily limit",
      vision: true,
      maxImages: 10,
    })),
];

/** Model ids in "Auto" order (REACT_APP_AI_MODELS can reorder or trim). */
export const MODELS = (process.env.REACT_APP_AI_MODELS
  ? process.env.REACT_APP_AI_MODELS.split(",").map((m) => m.trim()).filter((m) => MODEL_CATALOG.some((c) => c.id === m))
  : MODEL_CATALOG.map((m) => m.id));

/** Fast vision models for describing the photo, in order. */
export const PHOTO_MODELS = [
  "meta/llama-3.2-11b-vision-instruct",
  "meta/llama-3.2-90b-vision-instruct",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  ...MODEL_CATALOG.filter((m) => m.provider === "gemini").map((m) => m.id),
].filter((id) => MODELS.includes(id));

export const getModelInfo =(id) => MODEL_CATALOG.find((m) => m.id === id) || { id, label: id, provider: "gemini", vision: true, maxImages: 10 };
export const modelLabel = (id) => getModelInfo(id).label;

// ------------------------------------------------------------ user's choice
export const AUTO = "auto";
const KEY = "aiModel.v1";

export function getChosenModel() {
  const saved = readJSON(KEY, AUTO);
  return saved === AUTO || MODELS.includes(saved) ? saved : AUTO;
}

export function setChosenModel(id) {
  writeJSON(KEY, id);
}

/**
 * Models to try for one request: the chosen one first, then the rest as
 * backups (so a busy model never leaves the listener stuck). Photo requests
 * skip models that can't see.
 */
export function modelChain(chosen, { needsVision = false, forSongs = false } = {}) {
  // Song picking needs music knowledge: small vision models are never used for it.
  const usable = MODELS.filter((id) => (!needsVision || getModelInfo(id).vision) && (!forSongs || getModelInfo(id).songs !== false));
  if (chosen === AUTO || !usable.includes(chosen)) return usable;
  return [chosen, ...usable.filter((id) => id !== chosen)];
}
