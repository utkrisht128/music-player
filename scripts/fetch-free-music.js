/**
 * Fetches freely-licensed music from the Internet Archive and writes it to
 * src/data/freeCatalog.js.
 *
 * WHY the Internet Archive: it needs no API key, serves audio with
 * `Access-Control-Allow-Origin: *` and honours Range requests, so an <audio>
 * element in the browser can seek in it. The `netlabels` collection is
 * releases that netlabels published under Creative Commons terms.
 *
 * Nothing is scraped and nothing is re-hosted: the generated catalogue holds
 * the archive.org URLs, plus the licence URL the item itself declares. Items
 * with no declared licence are skipped rather than assumed to be free.
 *
 * Usage:  node scripts/fetch-free-music.js [--albums 12] [--query "..."]
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "src", "data", "freeCatalog.js");
const SEARCH = "https://archive.org/advancedsearch.php";
const UA = "music-player-main/1.0 (catalogue build script)";

// Only these count as "free to redistribute" for our purposes. An item whose
// licenceurl is absent or unrecognised is dropped.
const ALLOWED_LICENCE = /creativecommons\.org\/(licenses|publicdomain)\//i;

// The netlabels collection is unmoderated. Skip releases the archive flags as
// adult, or whose title reads that way, so the shipped catalogue stays safe to
// put in front of anyone.
const ADULT_TITLE = /\b(porn|xxx|erotic|explicit|nsfw)\b/i;

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};

const ALBUM_TARGET = Number(argOf("--albums", 12));
const QUERY = argOf(
  "--query",
  'collection:(netlabels) AND mediatype:(audio) AND format:(VBR MP3)'
);

async function json(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** One page of candidate item identifiers, newest-first is not useful here so
 *  we sort by downloads to bias toward releases people actually listen to. */
async function findItems(rows) {
  const url =
    `${SEARCH}?q=${encodeURIComponent(QUERY)}` +
    ["identifier", "title", "creator", "year", "licenseurl"]
      .map((f) => `&fl%5B%5D=${f}`)
      .join("") +
    `&sort%5B%5D=${encodeURIComponent("downloads desc")}` +
    `&rows=${rows}&page=1&output=json`;
  const data = await json(url);
  return data.response.docs;
}

const isAudio = (f) => f.format === "VBR MP3" || f.format === "128Kbps MP3";
const isImage = (f) => /JPEG|PNG|Item Image/i.test(f.format || "");

/** Turns one archive.org item into { album, tracks } in this app's shapes. */
async function buildAlbum(doc) {
  const meta = await json(`https://archive.org/metadata/${doc.identifier}`);
  const m = meta.metadata || {};
  const licence = m.licenseurl || doc.licenseurl;
  if (!licence || !ALLOWED_LICENCE.test(licence)) return null;
  if (m.adult || ADULT_TITLE.test(m.title || doc.title || "")) return null;

  const base = `https://archive.org/download/${encodeURIComponent(doc.identifier)}`;
  const files = meta.files || [];

  // Prefer VBR MP3; fall back to 128Kbps only for tracks VBR does not cover.
  const audio = files.filter(isAudio).sort((a, b) => (a.name > b.name ? 1 : -1));
  const byTitle = new Map();
  for (const f of audio) {
    const key = (f.title || f.name).replace(/\.mp3$/i, "");
    if (!byTitle.has(key) || f.format === "VBR MP3") byTitle.set(key, f);
  }
  const picked = [...byTitle.values()].slice(0, 12);
  if (picked.length === 0) return null;

  const cover = files.find(isImage);
  const albumId = `al_ia_${slug(doc.identifier)}`;
  const artist = clean(m.creator || doc.creator || "Unknown Artist");

  const tracks = picked.map((f, i) => ({
    id: `tr_ia_${slug(doc.identifier)}_${i + 1}`,
    title: clean(stripTrackNumber(f.title || f.name.replace(/\.mp3$/i, ""))),
    artists: [artist],
    albumId,
    trackNo: Number(f.track) || i + 1,
    src: `${base}/${encodeURIComponent(f.name)}`,
  }));

  return {
    album: {
      id: albumId,
      title: clean(m.title || doc.title || doc.identifier),
      artwork: cover ? `${base}/${encodeURIComponent(cover.name)}` : null,
      year: Number(String(m.year || m.date || doc.year || "").slice(0, 4)) || null,
      type: tracks.length > 3 ? "Album" : "EP",
      licence,
      sourceUrl: `https://archive.org/details/${doc.identifier}`,
    },
    tracks,
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const clean = (s) =>
  String(s).replace(/\s+/g, " ").replace(/^-+\s*|\s*-+$/g, "").trim() || "Untitled";
// Archive titles are often "03 - Song Name" or "03. Song Name".
const stripTrackNumber = (s) => String(s).replace(/^\s*\d{1,2}\s*[-._)]\s*/, "");

function render(albums) {
  const withArt = albums.filter((a) => a.album.artwork);
  const body = albums
    .map(
      ({ album }) =>
        `  { id: ${q(album.id)}, title: ${q(album.title)}, artwork: ${q(album.artwork)}, ` +
        `year: ${album.year ?? "null"}, type: ${q(album.type)}, ` +
        `licence: ${q(album.licence)}, sourceUrl: ${q(album.sourceUrl)} },`
    )
    .join("\n");

  const trackBody = albums
    .flatMap(({ tracks }) => tracks)
    .map(
      (t) =>
        `  { id: ${q(t.id)}, title: ${q(t.title)}, artists: [${t.artists.map(q).join(", ")}], ` +
        `albumId: ${q(t.albumId)}, trackNo: ${t.trackNo}, src: ${q(t.src)} },`
    )
    .join("\n");

  const shelf = withArt.slice(0, 8);

  return `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: node scripts/fetch-free-music.js
 *
 * Creative Commons licensed releases hosted by the Internet Archive. Each
 * album carries the licence URL the item itself declares and a link back to
 * its archive.org page, so attribution travels with the music. Audio is
 * streamed from archive.org — it is not re-hosted here.
 *
 * Generated ${new Date().toISOString().slice(0, 10)} from ${albums.length} releases.
 */

export const FREE_ALBUMS = [
${body}
];

export const FREE_TRACKS = [
${trackBody}
];

export const FREE_CURATED = [
  {
    id: "cur_free_netlabel",
    title: "Free & Creative Commons",
    description: "Netlabel releases from the Internet Archive, streamed from the source.",
    artwork: ${q(shelf[0]?.album.artwork ?? null)},
    trackIds: [${shelf.map((a) => q(a.tracks[0].id)).join(", ")}],
  },
];
`;
}

const q = (v) => (v === null || v === undefined ? "null" : JSON.stringify(v));

(async () => {
  // Over-fetch: many items fail the licence check or carry no usable MP3.
  const docs = await findItems(ALBUM_TARGET * 5);
  const albums = [];
  for (const doc of docs) {
    if (albums.length >= ALBUM_TARGET) break;
    try {
      const built = await buildAlbum(doc);
      if (built) {
        albums.push(built);
        process.stdout.write(`  + ${built.album.title} (${built.tracks.length} tracks)\n`);
      }
    } catch (err) {
      process.stdout.write(`  ! skipped ${doc.identifier}: ${err.message}\n`);
    }
  }

  if (albums.length === 0) throw new Error("No usable releases found; catalogue not written.");
  fs.writeFileSync(OUT, render(albums), "utf8");
  const n = albums.reduce((sum, a) => sum + a.tracks.length, 0);
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}: ${albums.length} albums, ${n} tracks.`);
})();
