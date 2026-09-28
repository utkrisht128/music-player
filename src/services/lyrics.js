/**
 * Lyrics lookup via LRCLIB (https://lrclib.net) — a free, open, keyless API
 * with CORS enabled. It returns time-synced LRC lyrics where available and
 * plain text otherwise.
 *
 * Nothing is bundled or stored beyond an in-memory cache for the session.
 * Lyrics are copyrighted by their writers/publishers: fine for a personal
 * player, but a public/commercial release should use a licensed provider
 * (e.g. Musixmatch) instead.
 */

const API = "https://lrclib.net/api";
const memo = new Map();

/** "[01:23.45] line" → [{ time: 83.45, text: "line" }] */
function parseLrc(lrc) {
  const lines = [];
  lrc.split(/\r?\n/).forEach((raw) => {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (stamps.length === 0) return;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    stamps.forEach((m) => lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text }));
  });
  return lines.sort((a, b) => a.time - b.time);
}

function simplify(text) {
  return String(text || "")
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s*(ft\.?|feat\.?).*$/i, "")
    .trim();
}

function pick(results, duration) {
  const usable = (results || []).filter((r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics));
  if (usable.length === 0) return null;
  if (!Number.isFinite(duration)) return usable.find((r) => r.syncedLyrics) || usable[0];
  // Prefer synced lyrics whose recording length matches what is playing.
  return usable
    .map((r) => ({ r, score: Math.abs((r.duration || 0) - duration) + (r.syncedLyrics ? 0 : 20) }))
    .sort((a, b) => a.score - b.score)[0].r;
}

/**
 * Returns { synced: [{time,text}] | null, plain: string | null } or null when
 * nothing was found.
 */
export async function getLyrics(track, duration) {
  if (!track) return null;
  const key = track.id;
  if (memo.has(key)) return memo.get(key);

  const title = simplify(track.title);
  const artist = simplify(track.artists?.[0] || "");

  const attempts = [
    artist && `${API}/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
    `${API}/search?q=${encodeURIComponent(`${title} ${artist}`.trim())}`,
    `${API}/search?track_name=${encodeURIComponent(title)}`,
  ].filter(Boolean);

  let found = null;
  for (const url of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(url);
    if (!response.ok) continue;
    // eslint-disable-next-line no-await-in-loop
    found = pick(await response.json(), duration);
    if (found) break;
  }

  const result = found
    ? {
        synced: found.syncedLyrics ? parseLrc(found.syncedLyrics) : null,
        plain: found.plainLyrics || null,
        source: `${found.trackName} — ${found.artistName}`,
      }
    : null;
  memo.set(key, result);
  return result;
}
