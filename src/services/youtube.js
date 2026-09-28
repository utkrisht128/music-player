/**
 * YouTube Data API v3 client.
 *
 * Turns YouTube videos from official label/artist channels into the app's
 * normal Track shape, so every page, list and menu handles them unchanged:
 *
 *   Track { id: "yt_<videoId>", source: "youtube", videoId, src: "youtube:<videoId>",
 *           title, artists[], artistIds: [], albumId: null, albumTitle, artwork, duration }
 *
 * Playback happens through the official IFrame player (see YouTubeManager);
 * nothing here downloads or extracts audio.
 *
 * Quota: the free daily budget is 10,000 units. `search` costs 100, every
 * other call here costs 1. Responses are therefore cached in localStorage,
 * and search is only ever triggered by an explicit, debounced query.
 *
 * The key is a REACT_APP_* variable, so it is inlined into the bundle and is
 * public by nature — restrict it to your domains in Google Cloud Console.
 */

import { readJSON, writeJSON } from "../utils/storage";

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.REACT_APP_YOUTUBE_API_KEY || "";

const CACHE_KEY = "yt:cache";
const TRACKS_KEY = "yt:tracks";
// Songs don't change: a search is reused for a week, charts for 12 hours.
const SEARCH_TTL = 1000 * 60 * 60 * 24 * 7;
const CHART_TTL = 1000 * 60 * 60 * 12;
const MAX_CACHE_ENTRIES = 80;
const MAX_STORED_TRACKS = 1500;

export const isYouTubeConfigured = () => Boolean(KEY);
export const isYouTubeId = (id) => typeof id === "string" && id.startsWith("yt_");

// ---------------------------------------------------------------------------
// Artist / movie ids. Derived from names, so the same singer or film groups
// together across every source, and old stored tracks upgrade on read.
// ---------------------------------------------------------------------------

export const slug = (text) =>
  String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "_").replace(/^_|_$/g, "");

export const isYouTubeArtistId = (id) => typeof id === "string" && id.startsWith("ytar_");
export const isYouTubeAlbumId = (id) => typeof id === "string" && id.startsWith("ytal_");

function decorate(track) {
  if (!track) return track;
  const hasAlbum = track.albumTitle && track.albumTitle !== cleanChannel(track.channel || "");
  return {
    ...track,
    artistIds: track.artists.map((name) => `ytar_${slug(name)}`),
    albumId: hasAlbum ? `ytal_${slug(track.albumTitle)}` : null,
  };
}

// ---------------------------------------------------------------------------
// Track store: every YouTube track the listener has seen, keyed by id, so that
// liked songs, playlists, history and the saved queue resolve after a reload.
// ---------------------------------------------------------------------------

const trackStore = new Map(
  Object.entries(readJSON(TRACKS_KEY, {})).map(([id, track]) => [id, decorate(track)])
);
let persistTimer = null;

function rememberTracks(tracks) {
  tracks.forEach((track) => trackStore.set(track.id, decorate(track)));
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    // Oldest-first Map order: trim from the front when over budget.
    const entries = Array.from(trackStore.entries());
    const kept = entries.slice(Math.max(0, entries.length - MAX_STORED_TRACKS));
    writeJSON(TRACKS_KEY, Object.fromEntries(kept));
  }, 500);
}

export function getStoredYouTubeTrack(id) {
  return trackStore.get(id) || null;
}

const SYNC_FIELDS = ["id", "source", "videoId", "src", "title", "artists", "albumTitle", "channel", "artwork", "duration", "published"];

/**
 * Compact copies of known YouTube tracks for the given ids, synced with the
 * account so another device can show and play them without an API call
 * (which fails when the key is referrer-restricted or out of quota).
 */
export function exportYouTubeTracks(ids) {
  const out = {};
  ids.forEach((id) => {
    const track = isYouTubeId(id) && trackStore.get(id);
    if (!track) return;
    out[id] = Object.fromEntries(SYNC_FIELDS.filter((k) => track[k] != null).map((k) => [k, track[k]]));
  });
  return out;
}

/** Seed the store with tracks synced from the account. Existing entries win. */
export function importYouTubeTracks(tracks) {
  if (!tracks || typeof tracks !== "object") return;
  const fresh = Object.values(tracks).filter(
    (t) => t && isYouTubeId(t.id) && typeof t.title === "string" && Array.isArray(t.artists) && !trackStore.has(t.id)
  );
  if (fresh.length) rememberTracks(fresh);
}

// ---------------------------------------------------------------------------
// Response cache
// ---------------------------------------------------------------------------

const responseCache = readJSON(CACHE_KEY, {});

function cached(key, ttl) {
  const hit = responseCache[key];
  return hit && Date.now() - hit.at < ttl ? hit.value : null;
}

function store(key, value) {
  responseCache[key] = { at: Date.now(), value };
  const keys = Object.keys(responseCache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys
      .sort((a, b) => responseCache[a].at - responseCache[b].at)
      .slice(0, keys.length - MAX_CACHE_ENTRIES)
      .forEach((stale) => delete responseCache[stale]);
  }
  writeJSON(CACHE_KEY, responseCache);
}

// ---------------------------------------------------------------------------
// Quota tracking
//
// The API does not report remaining quota, so usage is COUNTED here from the
// requests this browser makes (search = 100 units, everything else = 1). It is
// an estimate: other devices using the same key are not seen. The reset time
// is exact: Google resets the quota at midnight Pacific time.
//
// Google counts search and all other calls in separate buckets, so each is
// counted and marked "out" on its own. A bucket marked out is probed again
// after an hour, in case the 403 was a short-lived limit.
// ---------------------------------------------------------------------------

export const DAILY_QUOTA = 10000;
const QUOTA_KEY = "yt:quota";
const quotaListeners = new Set();

/** Today's date and the next reset, both in Pacific time. */
function pacificClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    resetAt: new Date(now.getTime() + 24 * 3600 * 1000 - elapsed - now.getMilliseconds()),
  };
}

function readQuota() {
  const { day } = pacificClock();
  const saved = readJSON(QUOTA_KEY, null);
  const fresh = saved && saved.day === day ? saved : { day };
  return {
    day,
    searchUsed: fresh.searchUsed || 0,
    otherUsed: fresh.otherUsed || 0,
    searchOut: fresh.searchOut || 0, // timestamp it was marked out, 0 if not
    otherOut: fresh.otherOut || 0,
  };
}

function writeQuota(next) {
  writeJSON(QUOTA_KEY, next);
  const status = getQuotaStatus();
  quotaListeners.forEach((fn) => fn(status));
}

export function getQuotaStatus() {
  const { searchUsed, otherUsed, searchOut } = readQuota();
  const used = searchUsed + otherUsed;
  const exhausted = isOut(searchOut);
  const { resetAt } = pacificClock();
  return {
    used: exhausted ? DAILY_QUOTA : Math.min(used, DAILY_QUOTA),
    limit: DAILY_QUOTA,
    searchesLeft: exhausted ? 0 : Math.max(0, Math.floor((DAILY_QUOTA - used) / 101)),
    detailsOut: isOut(readQuota().otherOut),
    exhausted,
    resetAt,
  };
}

export function onQuotaChange(listener) {
  quotaListeners.add(listener);
  return () => quotaListeners.delete(listener);
}

const REPROBE_MS = 1000 * 60 * 60;
function isOut(markedAt) {
  return Boolean(markedAt) && Date.now() - markedAt < REPROBE_MS;
}

const bucket = (path) => (path === "search" ? "search" : "other");

function spend(path) {
  const quota = readQuota();
  const key = `${bucket(path)}Used`;
  writeQuota({ ...quota, [key]: quota[key] + (path === "search" ? 100 : 1) });
}

function markExhausted(path) {
  writeQuota({ ...readQuota(), [`${bucket(path)}Out`]: Date.now() });
}

function limitError() {
  const time = getQuotaStatus().resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const error = new Error(`Daily YouTube search limit reached. It resets at ${time} (midnight Pacific time).`);
  error.quota = true;
  return error;
}

async function request(path, params) {
  if (!KEY) throw new Error("YouTube is not configured. Add REACT_APP_YOUTUBE_API_KEY to .env.local.");
  // Known to be out for today: don't spend a request finding that out again.
  if (isOut(readQuota()[`${bucket(path)}Out`])) throw limitError();
  spend(path);
  const url = new URL(`${API}/${path}`);
  Object.entries({ ...params, key: KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (response.ok && readQuota()[`${bucket(path)}Out`]) {
    writeQuota({ ...readQuota(), [`${bucket(path)}Out`]: 0 }); // probe succeeded
  }
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      markExhausted(path);
      throw limitError();
    }
    throw new Error(body?.error?.message || `YouTube request failed (${response.status}).`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function decodeEntities(text) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

/** ISO-8601 "PT3M42S" → 222 */
function parseDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return null;
  const seconds = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return seconds > 0 ? seconds : null;
}

// Noise labels append to titles: "(Official Video)", "| 4K", "[Lyrical]"...
const NOISE = /\s*[([][^)\]]*(official|video|audio|lyric|lyrical|visuali[sz]er|4k|hd|full song|music video|remaster)[^)\]]*[)\]]/gi;

function cleanChannel(name) {
  return name.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
}

/**
 * Best-effort split of a video title into song and artists.
 *   "Artist - Song (Official Video)"   → song, [artist]
 *   "Song - Movie | Actor | Composer"  → song, [channel]   (Indian label style)
 */
function parseTitle(rawTitle, channel) {
  const title = decodeEntities(rawTitle).replace(NOISE, "").trim();
  const [head, ...rest] = title.split("|").map((part) => part.trim());
  const credits = rest.filter((part) => part && !/official|4k|hd|video/i.test(part));
  const dash = head.split(/\s[-–—]\s/);

  if (dash.length >= 2) {
    const [left, right] = dash;
    const channelName = cleanChannel(channel).toLowerCase();
    // "Artist - Song" when the left side names the channel or the uploader is
    // an artist channel; otherwise labels use "Song - Movie".
    const leftIsArtist =
      left.toLowerCase().includes(channelName) ||
      channelName.includes(left.toLowerCase()) ||
      /vevo|topic$/i.test(channel);
    if (leftIsArtist) {
      return { title: right.trim(), artists: left.split(/,|&| x | ft\.? | feat\.? /i).map((s) => s.trim()).filter(Boolean), album: null };
    }
    return { title: left.trim(), artists: credits.length ? credits.slice(-2) : [cleanChannel(channel)], album: right.trim() };
  }

  return { title: head, artists: credits.length ? credits.slice(-2) : [cleanChannel(channel)], album: null };
}

function bestThumb(thumbnails = {}) {
  return (thumbnails.maxres || thumbnails.standard || thumbnails.high || thumbnails.medium || thumbnails.default || {}).url || null;
}

function toTrack(video) {
  const { title, artists, album } = parseTitle(video.snippet.title, video.snippet.channelTitle);
  return decorate({
    id: `yt_${video.id}`,
    source: "youtube",
    videoId: video.id,
    src: `youtube:${video.id}`,
    title,
    artists,
    artistIds: [],
    albumId: null,
    albumTitle: album || cleanChannel(video.snippet.channelTitle),
    channel: video.snippet.channelTitle,
    artwork: bestThumb(video.snippet.thumbnails),
    duration: parseDuration(video.contentDetails?.duration),
    published: video.snippet.publishedAt || null,
  });
}

/** Real songs only: no Shorts, no hour-long jukeboxes. */
const isSongLength = (t) => t.duration && t.duration >= 75 && t.duration < 60 * 12;

/**
 * Fetch full details for ids (1 unit per 50) and drop anything that cannot be
 * played inside our page: embedding disabled, live streams, or long mixes.
 */
async function hydrate(ids, { remember = true } = {}) {
  const unique = [...new Set(ids)];
  const byId = new Map();
  // 1 unit per 50 ids, however many ids there are.
  for (let i = 0; i < unique.length; i += 50) {
    // eslint-disable-next-line no-await-in-loop
    const body = await request("videos", {
      part: "snippet,contentDetails,status",
      id: unique.slice(i, i + 50).join(","),
      maxResults: 50,
    });
    (body.items || []).forEach((v) => byId.set(v.id, v));
  }
  const tracks = unique
    .map((id) => byId.get(id))
    .filter((v) => v && v.status?.embeddable !== false && v.snippet?.liveBroadcastContent === "none")
    .map(toTrack)
    .filter(isSongLength);
  if (remember) rememberTracks(tracks);
  return tracks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Search music videos. 101 quota units per uncached query. */
/**
 * Collapses variants of the same intent so they share one cache entry:
 * "Kesariya Song (Official Video)" and "kesariya" are the same search.
 */
export function normaliseQuery(query) {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(official|video|audio|lyrics?|lyrical|full|songs?|hd|4k|new|latest)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || query.trim().toLowerCase();
}

const inFlight = new Map();

/** Collapse concurrent identical requests into one network call. */
function once(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/**
 * Search YouTube itself: 101 quota units per uncached query. Prefer
 * searchCatalog(), which is free; call this only when it finds too little.
 */
// 50 is the API maximum; a search costs 100 units whatever the page size.
export async function searchYouTube(query, { limit = 50 } = {}) {
  const q = normaliseQuery(query);
  if (!q) return [];
  const cacheKey = `s:${q}`;
  const hit = cached(cacheKey, SEARCH_TTL);
  if (hit) {
    rememberTracks(hit);
    return hit.map(decorate);
  }
  return once(cacheKey, () => searchRemote(query.trim(), cacheKey, limit));
}

async function searchRemote(q, cacheKey, limit) {
  const body = await request("search", {
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: String(limit),
    q,
  });
  const items = (body.items || []).filter((item) => item.id?.videoId);
  let tracks;
  try {
    tracks = await hydrate(items.map((item) => item.id.videoId));
  } catch (error) {
    if (!error.quota) throw error;
    // Details are out of quota but the search itself worked: show the results
    // from the search snippets (no duration), and don't cache them.
    tracks = items.map((item) => toTrack({ id: item.id.videoId, snippet: item.snippet }));
    rememberTracks(tracks);
    return tracks;
  }
  store(cacheKey, tracks);
  return tracks;
}

/**
 * Most popular music videos in a region right now. 1 quota unit.
 * regionCode "IN" ≈ Bollywood/Punjabi, "US" ≈ Hollywood/international pop.
 */
export async function getYouTubeChart(regionCode, limit = 20) {
  const cacheKey = `c:${regionCode}:${limit}`;
  const hit = cached(cacheKey, CHART_TTL);
  if (hit) {
    rememberTracks(hit);
    return hit.map(decorate);
  }
  return once(cacheKey, () => chartRemote(regionCode, limit, cacheKey));
}

async function chartRemote(regionCode, limit, cacheKey) {
  const body = await request("videos", {
    part: "snippet,contentDetails,status",
    chart: "mostPopular",
    videoCategoryId: "10",
    regionCode,
    maxResults: String(Math.min(limit + 10, 50)),
  });
  const tracks = (body.items || [])
    .filter((v) => v.status?.embeddable !== false && v.snippet?.liveBroadcastContent === "none")
    .map(toTrack)
    .filter(isSongLength)
    .slice(0, limit);
  rememberTracks(tracks);
  store(cacheKey, tracks);
  return tracks;
}

// ---------------------------------------------------------------------------
// Song index: the cheap way to "search YouTube"
//
// Once a day, the latest uploads of official label and artist channels are
// listed (playlistItems, 1 unit per 50 songs) and hydrated (videos, 1 unit per
// 50). About 60 units buys ~2,000 songs that can then be searched locally for
// free, instead of 100 units for every single search.
//
// Channels are named by @handle and resolved once (1 unit each, cached
// permanently); a handle that no longer exists is skipped, never fatal.
// ---------------------------------------------------------------------------

const CATALOG_KEY = "yt:catalog";
const CHANNELS_KEY = "yt:channels";
const CATALOG_TTL = 1000 * 60 * 60 * 24;

export const CATALOG_SOURCES = {
  bollywood: {
    title: "Latest Bollywood",
    // [handle, pages of 50 uploads]
    channels: [
      ["@tseries", 3],
      ["@SonyMusicIndia", 2],
      ["@zeemusiccompany", 2],
      ["@tipsofficial", 1],
      ["@saregamamusic", 1],
      ["@SpeedRecords", 1],
    ],
  },
  hollywood: {
    title: "Latest Hollywood",
    channels: [
      ["@TaylorSwift", 1],
      ["@TheWeeknd", 1],
      ["@EdSheeran", 1],
      ["@DuaLipa", 1],
      ["@BrunoMars", 1],
      ["@justinbieber", 1],
      ["@BillieEilish", 1],
      ["@ArianaGrande", 1],
      ["@imaginedragons", 1],
      ["@coldplay", 1],
    ],
  },
};

// Label channels also upload trailers, jukeboxes and behind-the-scenes clips.
const NOT_A_SONG = /trailer|teaser|jukebox|behind the scenes|making of|interview|#shorts|\bscene\b|dialogue|non ?stop|reaction|announcement|podcast|episode|motion poster/i;

const channelCache = readJSON(CHANNELS_KEY, {});

async function resolveChannel(handle) {
  if (channelCache[handle] !== undefined) return channelCache[handle];
  const body = await request("channels", { part: "contentDetails", forHandle: handle });
  const uploads = body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  channelCache[handle] = uploads; // null is cached too: don't re-ask for a dead handle
  writeJSON(CHANNELS_KEY, channelCache);
  return uploads;
}

async function listUploads(playlistId, pages) {
  const ids = [];
  let pageToken;
  for (let page = 0; page < pages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const body = await request("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: 50,
      ...(pageToken ? { pageToken } : {}),
    });
    (body.items || []).forEach((item) => ids.push(item.contentDetails.videoId));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

async function buildShelf({ channels }) {
  const idLists = await Promise.all(
    channels.map(async ([handle, pages]) => {
      try {
        const uploads = await resolveChannel(handle);
        return uploads ? await listUploads(uploads, pages) : [];
      } catch (error) {
        if (error.quota) throw error;
        return []; // one broken channel must not sink the rest
      }
    })
  );
  const tracks = await hydrate(idLists.flat(), { remember: false });
  return tracks
    .filter((t) => !NOT_A_SONG.test(t.title) && !NOT_A_SONG.test(t.albumTitle || ""))
    .sort((a, b) => String(b.published).localeCompare(String(a.published)));
}

let catalog = readJSON(CATALOG_KEY, null);
if (catalog?.shelves) {
  Object.keys(catalog.shelves).forEach((key) => {
    catalog.shelves[key] = catalog.shelves[key].map(decorate);
  });
}

/**
 * The song index, refreshed at most once a day. Returns the stale copy (or
 * an empty one) when a refresh fails, so callers always get something.
 */
// A failed refresh is not retried for a while: without this, every search,
// suggestion and radio pick re-ran the whole ~60-unit refresh.
const CATALOG_RETRY_MS = 1000 * 60 * 30;
let catalogFailedAt = 0;

export async function getCatalog() {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL) return catalog;
  if (!KEY || Date.now() - catalogFailedAt < CATALOG_RETRY_MS) return catalog || { at: 0, shelves: {} };
  return once("catalog", async () => {
    try {
      const shelves = {};
      // Sequential, so a quota failure stops before spending more.
      for (const [id, source] of Object.entries(CATALOG_SOURCES)) {
        // eslint-disable-next-line no-await-in-loop
        shelves[id] = await buildShelf(source);
      }
      catalog = { at: Date.now(), shelves };
      writeJSON(CATALOG_KEY, catalog);
    } catch (error) {
      catalogFailedAt = Date.now();
      // eslint-disable-next-line no-console
      console.warn("Song index refresh failed; using the previous copy.", error);
    }
    return catalog || { at: 0, shelves: {} };
  });
}

function catalogTracks() {
  const byId = new Map();
  Object.values(catalog?.shelves || {}).flat().forEach((t) => byId.set(t.id, t));
  trackStore.forEach((t, id) => { if (!byId.has(id)) byId.set(id, t); });
  return Array.from(byId.values());
}

// Devanagari → rough Latin, so "केसरिया" finds "Kesariya".
const DEVANAGARI = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ट": "t", "ठ": "th",
  "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph",
  "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s",
  "ह": "h", "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ं": "n", "ँ": "n", "ः": "h", "ृ": "ri", "ज़": "z", "फ़": "f", "ड़": "r", "क़": "k", "ग़": "g",
};
const CONSONANTS = "कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह";

function transliterate(text) {
  let out = "";
  const chars = Array.from(text.normalize("NFC"));
  chars.forEach((ch, i) => {
    if (ch === "्") return; // virama: drop the inherent vowel (handled below)
    const mapped = DEVANAGARI[ch];
    if (mapped === undefined) { out += ch; return; }
    out += mapped;
    // A consonant not followed by a vowel sign or virama carries an "a".
    const next = chars[i + 1];
    if (CONSONANTS.includes(ch) && next && CONSONANTS.includes(next)) out += "a";
  });
  return out;
}

const fold = (text) =>
  transliterate(String(text || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Hinglish spelling key: "kesariya", "kesriya", "kesareeya" and "केसरिया"
 * all reduce to the same skeleton.
 */
function phonetic(word) {
  return fold(word)
    .replace(/[^a-z0-9]/g, "")
    .replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/ck/g, "k")
    .replace(/([bcdfgjklmnprstv])h/g, "$1")
    .replace(/ee|ii|ea/g, "i").replace(/oo|uu|ou/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?!^)[aeiouy]/g, "");
}

/** Levenshtein distance, capped: we only care whether it is 0, 1 or 2. */
function distance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/** How well one query word matches a field: 0 = not at all. */
function wordScore(word, text, words, keys) {
  if (text.startsWith(word)) return 4;
  if (text.includes(word)) return 3;
  const key = phonetic(word);
  if (key.length >= 2 && keys.some((k) => k === key || (key.length >= 3 && k.startsWith(key)))) return 2.5;
  if (word.length >= 4 && words.some((w) => distance(word, w, word.length >= 7 ? 2 : 1) <= (word.length >= 7 ? 2 : 1))) return 2;
  return 0;
}

function fieldIndex(text) {
  const folded = fold(text);
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean);
  return { folded, words, keys: words.map(phonetic) };
}

/**
 * Free search over the song index plus every YouTube song seen before.
 * Every query word must appear somewhere; title hits outrank credit hits.
 */
const indexCache = new WeakMap();
function indexFor(track) {
  let entry = indexCache.get(track);
  if (!entry) {
    entry = {
      title: fieldIndex(track.title),
      credits: fieldIndex(`${track.artists.join(" ")} ${track.albumTitle || ""} ${track.channel || ""}`),
    };
    indexCache.set(track, entry);
  }
  return entry;
}

/** Scores any track list against a query; used for YouTube and library alike. */
export function rankTracks(tracks, query, limit = 30) {
  const words = normaliseQuery(query).split(" ").map(fold).filter(Boolean);
  if (words.length === 0) return [];
  return tracks
    .map((track) => {
      const { title, credits } = indexFor(track);
      let score = 0;
      for (const word of words) {
        const inTitle = wordScore(word, title.folded, title.words, title.keys);
        const inCredits = inTitle ? 0 : wordScore(word, credits.folded, credits.words, credits.keys) * 0.5;
        if (!inTitle && !inCredits) return null;
        score += inTitle || inCredits;
      }
      return { track, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.track);
}

/**
 * Free search over the song index plus every YouTube song seen before.
 * Every query word must match: exactly, by Hinglish sound-alike, or with a
 * small typo. Title hits outrank artist/movie hits.
 */
export async function searchCatalog(query, limit = 30) {
  await getCatalog();
  return rankTracks(catalogTracks(), query, limit);
}

/** Type-ahead: distinct song titles for the query, instantly and for free. */
export function suggest(query, limit = 6) {
  if (normaliseQuery(query).length < 2) return [];
  const seen = new Set();
  return rankTracks(catalogTracks(), query, 40)
    .filter((t) => {
      const key = fold(t.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Artist and movie pages for YouTube songs, built from the index (free).
// ---------------------------------------------------------------------------

export async function getYouTubeArtist(id) {
  await getCatalog();
  const tracks = catalogTracks().filter((t) => t.artistIds.includes(id));
  if (tracks.length === 0) return null;
  const name = tracks[0].artists[tracks[0].artistIds.indexOf(id)];
  const albumIds = [...new Set(tracks.map((t) => t.albumId).filter(Boolean))];
  return { id, name, artwork: tracks[0].artwork, trackIds: tracks.map((t) => t.id), albumIds, source: "youtube" };
}

export async function getYouTubeAlbum(id) {
  await getCatalog();
  const tracks = catalogTracks().filter((t) => t.albumId === id);
  if (tracks.length === 0) return null;
  const artistCounts = new Map();
  tracks.forEach((t) => t.artistIds.forEach((a, i) => {
    const entry = artistCounts.get(a) || { id: a, name: t.artists[i], n: 0 };
    entry.n += 1;
    artistCounts.set(a, entry);
  }));
  const artists = [...artistCounts.values()].sort((a, b) => b.n - a.n).slice(0, 2);
  const years = tracks.map((t) => (t.published || "").slice(0, 4)).filter(Boolean).sort();
  return {
    id,
    title: tracks[0].albumTitle,
    artwork: tracks[0].artwork,
    year: years[0] || "",
    type: "Movie / album",
    artistIds: artists.map((a) => a.id),
    artistNames: artists.map((a) => a.name),
    trackIds: tracks.map((t) => t.id),
    source: "youtube",
  };
}

/** Other artists who share songs with this one. */
export async function getYouTubeRelatedArtists(id) {
  await getCatalog();
  const counts = new Map();
  catalogTracks().forEach((t) => {
    if (!t.artistIds.includes(id)) return;
    t.artistIds.forEach((other, i) => {
      if (other === id) return;
      const entry = counts.get(other) || { id: other, name: t.artists[i], artwork: t.artwork, n: 0 };
      entry.n += 1;
      counts.set(other, entry);
    });
  });
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 12);
}

// ---------------------------------------------------------------------------
// Radio: what to play when the queue runs out (free).
// ---------------------------------------------------------------------------

export async function getRadioTracks(seed, excludeIds = [], limit = 10) {
  await getCatalog();
  const exclude = new Set(excludeIds);
  const artists = new Set(seed?.artistIds || []);
  const pool = catalogTracks().filter((t) => !exclude.has(t.id));
  const scored = pool.map((t) => {
    let score = Math.random(); // variety between equally good picks
    if (t.artistIds.some((a) => artists.has(a))) score += 4;
    if (seed?.albumId && t.albumId === seed.albumId) score += 3;
    if (seed?.channel && t.channel === seed.channel) score += 1.5;
    return { t, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((e) => e.t);
}

// ---------------------------------------------------------------------------
// Moods: keyword filters over the index (free).
// ---------------------------------------------------------------------------

export const MOODS = [
  { id: "romantic", title: "Romantic", color: "#e0245e", words: ["love", "ishq", "pyaar", "pyar", "dil", "mohabbat", "jaana", "sanam", "romantic", "tum", "saath", "heart", "baby"] },
  { id: "party", title: "Party", color: "#f59e0b", words: ["party", "dance", "nachde", "naach", "club", "dj", "remix", "night", "desi", "bhangra", "thumka"] },
  { id: "sad", title: "Heartbreak", color: "#3b82f6", words: ["sad", "broken", "judaai", "bewafa", "tanha", "alone", "yaad", "cry", "dard", "goodbye", "breakup"] },
  { id: "devotional", title: "Devotional", color: "#f97316", words: ["bhajan", "aarti", "mantra", "ram", "krishna", "shiva", "shiv", "hanuman", "mata", "ganesh", "devotional", "sai"] },
  { id: "punjabi", title: "Punjabi", color: "#10b981", words: ["punjabi", "jatt", "mutiyaar", "gabru", "sidhu", "diljit", "karan aujla", "ap dhillon", "speed records"] },
  { id: "chill", title: "Chill", color: "#8b5cf6", words: ["lofi", "lo fi", "acoustic", "unplugged", "slowed", "reverb", "chill", "calm"] },
];

export async function getMoodTracks(id, limit = 60) {
  const mood = MOODS.find((m) => m.id === id);
  if (!mood) return null;
  await getCatalog();
  const matches = catalogTracks().filter((t) => {
    const text = ` ${fold(`${t.title} ${t.albumTitle} ${t.artists.join(" ")} ${t.channel}`)} `;
    return mood.words.some((w) => text.includes(` ${w}`) || (w.length > 4 && text.includes(w)));
  });
  return { ...mood, tracks: matches.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// Playlist import and id resolution (1 unit per 50 songs).
// ---------------------------------------------------------------------------

/** Accepts a full YouTube / YouTube Music URL or a bare playlist id. */
export function parsePlaylistId(input) {
  const text = String(input || "").trim();
  const fromUrl = /[?&]list=([A-Za-z0-9_-]+)/.exec(text);
  if (fromUrl) return fromUrl[1];
  return /^(PL|OL|RD|UU|LL|FL)[A-Za-z0-9_-]{10,}$/.test(text) ? text : null;
}

export async function importPlaylist(input, maxSongs = 200) {
  const playlistId = parsePlaylistId(input);
  if (!playlistId) throw new Error("That doesn't look like a YouTube playlist link.");
  const meta = await request("playlists", { part: "snippet", id: playlistId });
  const info = meta.items?.[0]?.snippet;
  if (!info) throw new Error("Playlist not found. Make sure it is public or unlisted.");
  const ids = await listUploads(playlistId, Math.ceil(maxSongs / 50));
  const tracks = await hydrate(ids);
  return { title: info.title, description: info.description || "", tracks };
}

/**
 * Tracks for ids this browser has never seen (a shared link, an imported
 * backup). Known ids cost nothing; unknown ones 1 unit per 50.
 */
export async function resolveYouTubeIds(ids) {
  const missing = ids.filter((id) => isYouTubeId(id) && !trackStore.has(id)).map((id) => id.slice(3));
  if (missing.length > 0 && KEY) {
    try {
      await hydrate(missing);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Could not resolve some YouTube songs.", error);
    }
  }
  return ids.map((id) => trackStore.get(id)).filter(Boolean);
}
