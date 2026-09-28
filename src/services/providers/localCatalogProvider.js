/**
 * Local catalogue provider.
 *
 * Implements the MusicProvider interface over files that ship with the app.
 * This is the ONLY module that knows how the local catalogue is shaped —
 * swapping in a licensed streaming provider means writing a sibling module
 * with the same method signatures and pointing MusicService at it. No page or
 * component imports this file directly.
 *
 * Every method is async and returns the same normalised entity shapes so
 * callers cannot tell a local lookup from a network one:
 *   Track  { id, title, artists[], artistIds[], albumId, albumTitle, artwork, src, trackNo }
 *   Album  { id, title, artwork, year, type, artistIds[], artistNames[], trackIds[] }
 *   Artist { id, name, artwork, trackIds[], albumIds[] }
 */

import { TRACKS, ALBUMS, CURATED } from "../../data/catalog";
import { FREE_ALBUMS, FREE_TRACKS, FREE_CURATED } from "../../data/freeCatalog";

// The bundled catalogue plus the Creative Commons releases streamed from the
// Internet Archive (see scripts/fetch-free-music.js). They are merged here
// rather than in catalog.js so the generated file stays regenerable on its
// own, and every entity keeps the same shape either way — a free album's
// `artwork` and a free track's `src` are absolute URLs instead of bundled
// asset paths, which nothing downstream needs to know about.
const ALL_ALBUM_SOURCES = [...ALBUMS, ...FREE_ALBUMS];
const ALL_TRACK_SOURCES = [...TRACKS, ...FREE_TRACKS];
const ALL_CURATED_SOURCES = [...CURATED, ...FREE_CURATED];

/** Deterministic, URL-safe id from a display name. */
function artistIdFor(name) {
  return `ar_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

// ---------------------------------------------------------------------------
// Index construction (once, at module load — the catalogue is static).
// ---------------------------------------------------------------------------

const albumsById = new Map();
const artistsById = new Map();
const tracksById = new Map();

ALL_ALBUM_SOURCES.forEach((album) => {
  albumsById.set(album.id, {
    ...album,
    artistIds: [],
    artistNames: [],
    trackIds: [],
  });
});

ALL_TRACK_SOURCES.forEach((raw) => {
  const album = albumsById.get(raw.albumId);
  if (!album) {
    // A track pointing at a missing album would crash every card that renders
    // it. Skip it loudly instead.
    // eslint-disable-next-line no-console
    console.warn(`Track ${raw.id} references unknown album ${raw.albumId}; skipped.`);
    return;
  }

  const artistIds = raw.artists.map(artistIdFor);

  const track = {
    id: raw.id,
    title: raw.title,
    artists: raw.artists,
    artistIds,
    albumId: album.id,
    albumTitle: album.title,
    artwork: album.artwork,
    src: raw.src,
    trackNo: raw.trackNo,
    source: raw.src.startsWith("http") ? "internet-archive" : "local",
  };

  tracksById.set(track.id, track);
  album.trackIds.push(track.id);

  raw.artists.forEach((name, index) => {
    const id = artistIds[index];
    if (!artistsById.has(id)) {
      artistsById.set(id, { id, name, artwork: album.artwork, trackIds: [], albumIds: [] });
    }
    const artist = artistsById.get(id);
    artist.trackIds.push(track.id);
    if (!artist.albumIds.includes(album.id)) artist.albumIds.push(album.id);

    // Only the primary (first-billed) artist is credited on the album header.
    if (index === 0 && !album.artistIds.includes(id)) {
      album.artistIds.push(id);
      album.artistNames.push(name);
    }
  });
});

albumsById.forEach((album) => album.trackIds.sort((a, b) => tracksById.get(a).trackNo - tracksById.get(b).trackNo));

const ALL_TRACKS = ALL_TRACK_SOURCES.map((t) => tracksById.get(t.id)).filter(Boolean);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Combining marks left behind by NFD decomposition, written as an escape so
// the pattern survives any source re-encoding.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function normalise(value) {
  return String(value).toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

/**
 * Scores a candidate against a query: prefix matches outrank substring
 * matches, so typing "we" surfaces "We Rollin" above "Sadda Pyaar".
 */
function score(haystack, needle) {
  const text = normalise(haystack);
  const index = text.indexOf(needle);
  if (index === -1) return 0;
  if (index === 0) return 3;
  return /\s/.test(text[index - 1]) ? 2 : 1;
}

function rank(items, needle, fields) {
  return items
    .map((item) => ({
      item,
      score: fields.reduce((best, field) => Math.max(best, score(field(item), needle)), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

const localCatalogProvider = {
  id: "local",
  name: "Local library",

  async getAllTracks() {
    return ALL_TRACKS;
  },

  async getTrack(id) {
    return tracksById.get(id) || null;
  },

  async getTracks(ids) {
    // Preserves caller order and drops ids that no longer resolve, which is
    // what keeps a saved playlist working after a track is removed.
    return ids.map((id) => tracksById.get(id)).filter(Boolean);
  },

  async getAlbum(id) {
    return albumsById.get(id) || null;
  },

  async getAllAlbums() {
    return Array.from(albumsById.values());
  },

  async getArtist(id) {
    return artistsById.get(id) || null;
  },

  async getAllArtists() {
    return Array.from(artistsById.values());
  },

  /** Artists sharing at least one album with this one, most-shared first. */
  async getRelatedArtists(id) {
    const artist = artistsById.get(id);
    if (!artist) return [];
    const overlap = new Map();
    artist.trackIds.forEach((trackId) => {
      tracksById.get(trackId).artistIds.forEach((other) => {
        if (other === id) return;
        overlap.set(other, (overlap.get(other) || 0) + 1);
      });
    });
    return Array.from(overlap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([artistId]) => artistsById.get(artistId))
      .filter(Boolean);
  },

  /** Artist tracks ordered by how often the artist appears elsewhere. */
  async getArtistTopTracks(id, limit = 5) {
    const artist = artistsById.get(id);
    if (!artist) return [];
    return artist.trackIds.slice(0, limit).map((trackId) => tracksById.get(trackId));
  },

  async getCuratedPlaylists() {
    return ALL_CURATED_SOURCES.map((playlist) => ({
      ...playlist,
      curated: true,
      trackIds: playlist.trackIds.filter((id) => tracksById.has(id)),
    }));
  },

  async getCuratedPlaylist(id) {
    const found = ALL_CURATED_SOURCES.find((playlist) => playlist.id === id);
    if (!found) return null;
    return { ...found, curated: true, trackIds: found.trackIds.filter((t) => tracksById.has(t)) };
  },

  async search(query) {
    const needle = normalise(query).trim();
    if (!needle) return { tracks: [], artists: [], albums: [], playlists: [] };

    return {
      tracks: rank(ALL_TRACKS, needle, [
        (t) => t.title,
        (t) => t.artists.join(" "),
        (t) => t.albumTitle,
      ]),
      artists: rank(Array.from(artistsById.values()), needle, [(a) => a.name]),
      albums: rank(Array.from(albumsById.values()), needle, [
        (a) => a.title,
        (a) => a.artistNames.join(" "),
      ]),
      playlists: rank(await this.getCuratedPlaylists(), needle, [
        (p) => p.title,
        (p) => p.description,
      ]),
    };
  },
};

export default localCatalogProvider;
