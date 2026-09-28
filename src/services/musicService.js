/**
 * MusicService — the single seam between the UI and whatever supplies music.
 *
 *   UI / pages  ->  MusicService  ->  provider  ->  audio source
 *
 * Pages and components import ONLY this module. They never learn whether a
 * track came from a bundled file, a user-selected local file, or (later) a
 * licensed streaming API.
 *
 * ── Adding a licensed provider ────────────────────────────────────────────
 * Write a module exposing the same methods as localCatalogProvider and call
 * `setProvider(yourProvider)` at startup. Nothing else changes.
 *
 * If that provider needs a client secret, it MUST NOT live here: bundled
 * frontend JavaScript is fully readable by anyone who loads the page. Put the
 * secret in a small backend that holds the credential and exposes only the
 * endpoints your provider module calls. Values in `process.env.REACT_APP_*`
 * are inlined into the bundle at build time and are NOT secret.
 */

import localCatalogProvider from "./providers/localCatalogProvider";
import {
  getCatalog,
  getMoodTracks,
  getQuotaStatus,
  getRadioTracks,
  getYouTubeAlbum,
  getYouTubeArtist,
  getYouTubeRelatedArtists,
  importPlaylist,
  isYouTubeAlbumId,
  isYouTubeArtistId,
  MOODS,
  onQuotaChange,
  rankTracks,
  resolveYouTubeIds,
  searchCatalog,
  suggest,
  getStoredYouTubeTrack,
  getYouTubeChart,
  isYouTubeConfigured,
  isYouTubeId,
  searchYouTube,
} from "./youtube";

export {
  getMoodTracks,
  getRadioTracks,
  importPlaylist as importYouTubePlaylist,
  MOODS,
  rankTracks,
  suggest as getSuggestions,
  getCatalog as getYouTubeCatalog,
  getQuotaStatus,
  getYouTubeChart,
  isYouTubeConfigured,
  onQuotaChange,
  searchCatalog as searchYouTubeCatalog,
  searchYouTube,
};

let provider = localCatalogProvider;

/** Swap the active provider (see the note above about credentials). */
export function setProvider(next) {
  if (!next || typeof next.search !== "function") {
    throw new Error("A music provider must implement the provider interface.");
  }
  provider = next;
}

export function getProviderInfo() {
  return { id: provider.id, name: provider.name };
}

/**
 * Wraps a provider call so a failure surfaces as a typed, user-presentable
 * error instead of an unhandled rejection or a raw stack trace on screen.
 */
async function call(method, args, fallback) {
  const fn = provider[method];
  if (typeof fn !== "function") {
    // An optional capability the active provider does not implement.
    return fallback;
  }
  try {
    return await fn.apply(provider, args);
  } catch (cause) {
    // eslint-disable-next-line no-console
    console.error(`MusicService.${method} failed`, cause);
    const error = new Error("We could not load that right now. Please try again.");
    error.cause = cause;
    error.method = method;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------
export const getAllTracks = () => call("getAllTracks", [], []);
export async function getTrack(id) {
  if (isYouTubeId(id)) return getStoredYouTubeTrack(id) || (await resolveYouTubeIds([id]))[0] || null;
  return call("getTrack", [id], null);
}

/**
 * Resolves ids from every source, preserving order. YouTube tracks are kept
 * in a local store (see services/youtube.js) so liked songs, playlists and
 * history containing them survive a reload.
 */
export async function getTracks(ids) {
  const local = await call("getTracks", [ids.filter((id) => !isYouTubeId(id))], []);
  const byId = new Map(local.map((track) => [track.id, track]));
  // Unknown YouTube ids (shared link, restored backup) are fetched once.
  const youtube = await resolveYouTubeIds(ids.filter(isYouTubeId));
  youtube.forEach((track) => byId.set(track.id, track));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Albums / artists
// ---------------------------------------------------------------------------
// YouTube artists ("ytar_") and movies/albums ("ytal_") are built from the
// song index, so the same Artist and Album pages serve both sources.
export const getAlbum = (id) => (isYouTubeAlbumId(id) ? getYouTubeAlbum(id) : call("getAlbum", [id], null));
export const getAllAlbums = () => call("getAllAlbums", [], []);
export const getArtist = (id) => (isYouTubeArtistId(id) ? getYouTubeArtist(id) : call("getArtist", [id], null));
export const getAllArtists = () => call("getAllArtists", [], []);
export const getRelatedArtists = (id) =>
  isYouTubeArtistId(id) ? getYouTubeRelatedArtists(id) : call("getRelatedArtists", [id], []);
export async function getArtistTopTracks(id, limit = 5) {
  if (!isYouTubeArtistId(id)) return call("getArtistTopTracks", [id, limit], []);
  const artist = await getYouTubeArtist(id);
  return artist ? getTracks(artist.trackIds.slice(0, limit)) : [];
}

// ---------------------------------------------------------------------------
// Curated / discovery
// ---------------------------------------------------------------------------
export const getCuratedPlaylists = () => call("getCuratedPlaylists", [], []);
export const getCuratedPlaylist = (id) => call("getCuratedPlaylist", [id], null);

/**
 * Recommendations. Given the ids the listener has played most, prefer tracks
 * that share an artist with them; otherwise fall back to the catalogue order.
 * This is derived from the listener's own history — it is not a claim about
 * anyone else's listening.
 */
export async function getRecommendations(seedTrackIds = [], limit = 8) {
  const all = await getAllTracks();
  if (seedTrackIds.length === 0) return all.slice(0, limit);

  const seeds = await getTracks(seedTrackIds);
  const seedArtists = new Set(seeds.flatMap((t) => t.artistIds));
  const seedIds = new Set(seedTrackIds);

  const scored = all
    .filter((track) => !seedIds.has(track.id))
    .map((track) => ({
      track,
      overlap: track.artistIds.filter((id) => seedArtists.has(id)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, limit).map((entry) => entry.track);
}

/** A stable "popular" shelf: the catalogue front, not an invented chart. */
export async function getFeaturedTracks(limit = 10) {
  const all = await getAllTracks();
  return all.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export const search = (query) =>
  call("search", [query], { tracks: [], artists: [], albums: [], playlists: [] });
