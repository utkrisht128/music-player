/**
 * AI playlist maker: Gemini (through Firebase AI Logic) suggests songs for a
 * prompt, and we match each suggestion to a playable track.
 *
 * Uses the Gemini Developer API backend, which has a free tier on the Spark
 * plan. Enable it once in Firebase console -> AI Logic -> Get started.
 * Matching tries the free song index first; only misses fall back to a
 * YouTube search (100 quota units each), capped per playlist.
 */
import { app, isFirebaseConfigured } from "./firebase";
import { isYouTubeConfigured, searchYouTube, searchYouTubeCatalog } from "./musicService";

const MODEL = process.env.REACT_APP_GEMINI_MODEL || "gemini-2.5-flash";
const MAX_YOUTUBE_LOOKUPS = 5;

export const isAIConfigured = isFirebaseConfigured;

let modelPromise = null;

function getModel() {
  if (!modelPromise) {
    modelPromise = import("firebase/ai").then(({ getAI, getGenerativeModel, GoogleAIBackend, Schema }) => {
      const ai = getAI(app, { backend: new GoogleAIBackend() });
      return getGenerativeModel(ai, {
        model: MODEL,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: Schema.object({
            properties: {
              name: Schema.string(),
              description: Schema.string(),
              songs: Schema.array({
                items: Schema.object({
                  properties: { title: Schema.string(), artist: Schema.string() },
                }),
              }),
            },
          }),
        },
      });
    });
  }
  return modelPromise;
}

function buildPrompt(request, count, tasteTracks) {
  const taste = tasteTracks.length
    ? `\nThe listener has recently enjoyed: ${tasteTracks
        .slice(0, 15)
        .map((t) => `"${t.title}" by ${(t.artists || []).join(", ")}`)
        .join("; ")}. Use this only as a hint about their taste.`
    : "";
  return `You are a music curator. Create a playlist for this request: "${request}".
Suggest exactly ${count} real, well-known, officially released songs that exist on YouTube.
Use each song's official title and main artist. No duplicates, no made-up songs.
Also give the playlist a short catchy name (max 5 words) and a one-sentence description.${taste}`;
}

/** Best local match for a suggestion, or null. */
async function matchFree(song) {
  const hits = await searchYouTubeCatalog(`${song.title} ${song.artist}`, 1);
  return hits[0] || null;
}

async function matchYouTube(song) {
  const hits = await searchYouTube(`${song.title} ${song.artist}`, { limit: 5 });
  return hits[0] || null;
}

/**
 * Returns { name, description, tracks, missed } where missed lists the
 * suggestions we could not find.
 */
export async function generatePlaylist(request, { count = 15, tasteTracks = [] } = {}) {
  const model = await getModel();
  let plan;
  try {
    const result = await model.generateContent(buildPrompt(request, count, tasteTracks));
    plan = JSON.parse(result.response.text());
  } catch (cause) {
    // eslint-disable-next-line no-console
    console.error("AI playlist failed", cause);
    const message = String(cause?.message || "");
    const error = new Error(
      /quota|429|exhausted/i.test(message)
        ? "The AI is busy right now (free limit reached). Try again in a minute."
        : /api.*not.*enabled|403|permission/i.test(message)
          ? "AI playlists aren't enabled for this site yet."
          : "Couldn't make a playlist right now. Please try again."
    );
    error.cause = cause;
    throw error;
  }

  const songs = (plan.songs || []).filter((s) => s?.title).slice(0, count);
  const matches = await Promise.all(songs.map((song) => matchFree(song).catch(() => null)));

  // Paid lookups run one at a time so a quota error stops the rest.
  let lookups = 0;
  for (let i = 0; i < songs.length; i += 1) {
    if (matches[i] || !isYouTubeConfigured() || lookups >= MAX_YOUTUBE_LOOKUPS) continue;
    lookups += 1;
    try {
      matches[i] = await matchYouTube(songs[i]);
    } catch {
      break;
    }
  }

  const seen = new Set();
  const tracks = [];
  const missed = [];
  songs.forEach((song, i) => {
    const track = matches[i];
    if (!track) missed.push(song);
    else if (!seen.has(track.id)) {
      seen.add(track.id);
      tracks.push(track);
    }
  });

  return {
    name: plan.name || "AI Mix",
    description: plan.description || `Made for “${request}”`,
    tracks,
    missed,
  };
}
