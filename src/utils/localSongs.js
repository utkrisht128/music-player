/**
 * Songs the listener adds from their own device, kept in IndexedDB.
 *
 * The audio file itself is stored (as a Blob) so the library survives a
 * refresh. Nothing is uploaded — it all stays in this browser. Object URLs
 * are cached per song for the life of the tab so a track keeps playing while
 * you navigate between pages.
 */

const DB_NAME = "mp-local-songs";
const STORE = "songs";
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;

const urlCache = new Map();
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser cannot store songs."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function tx(mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const result = run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Storage is full."));
  });
}

export function isAudioFile(file) {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

/** "03 - Artist - Title.mp3" -> { title, artist } as far as the name allows. */
function parseFilename(filename) {
  const cleaned = filename.replace(/\.[^.]+$/, "").replace(/^\d+\s*[-._)]\s*/, "").replace(/_/g, " ").trim();
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "", title: cleaned || filename };
}

function decodeText(bytes, encoding) {
  const label = encoding === 1 ? "utf-16" : encoding === 2 ? "utf-16be" : encoding === 3 ? "utf-8" : "latin1";
  try {
    return new TextDecoder(label).decode(bytes).replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

/** Reads title, artist, album and cover from an ID3v2 tag (most MP3s). */
async function readID3(file) {
  const tags = {};
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return tags; // "ID3"
    const version = head[3];
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    const data = new Uint8Array(await file.slice(10, 10 + Math.min(size, 4_000_000)).arrayBuffer());
    let pos = 0;
    while (pos + 10 < data.length) {
      const id = String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const b = data.subarray(pos + 4, pos + 8);
      const frameSize = version === 4
        ? ((b[0] & 0x7f) << 21) | ((b[1] & 0x7f) << 14) | ((b[2] & 0x7f) << 7) | (b[3] & 0x7f)
        : (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
      const body = data.subarray(pos + 10, pos + 10 + frameSize);
      if (id === "TIT2") tags.title = decodeText(body.subarray(1), body[0]);
      else if (id === "TPE1") tags.artist = decodeText(body.subarray(1), body[0]);
      else if (id === "TALB") tags.album = decodeText(body.subarray(1), body[0]);
      else if (id === "APIC" && !tags.cover) {
        const encoding = body[0];
        let i = 1;
        while (i < body.length && body[i] !== 0) i++; // MIME type
        const mime = decodeText(body.subarray(1, i), 0) || "image/jpeg";
        i += 2; // terminator + picture type
        const wide = encoding === 1 || encoding === 2;
        while (i < body.length && !(body[i] === 0 && (!wide || body[i + 1] === 0))) i += wide ? 2 : 1;
        i += wide ? 2 : 1; // description terminator
        tags.cover = new Blob([body.slice(i)], { type: mime.includes("/") ? mime : `image/${mime}` });
      }
      pos += 10 + frameSize;
    }
  } catch {
    // Unreadable tags just fall back to the filename.
  }
  return tags;
}

function urlFor(key, blob) {
  if (!blob) return null;
  if (!urlCache.has(key)) urlCache.set(key, URL.createObjectURL(blob));
  return urlCache.get(key);
}

/** Stored record -> the track shape the player understands. */
function toTrack(record) {
  return {
    id: record.id,
    title: record.title,
    artists: [record.artist || "Unknown artist"],
    artistIds: [],
    albumId: null,
    albumTitle: record.album || "Your uploads",
    artwork: urlFor(`${record.id}:cover`, record.cover),
    src: urlFor(record.id, record.blob),
    source: "device",
    addedAt: record.addedAt,
    size: record.blob?.size || 0,
  };
}

export async function getLocalSongs() {
  const records = await tx("readonly", (store) => store.getAll());
  return (records || []).sort((a, b) => b.addedAt - a.addedAt).map(toTrack);
}

/** Saves files; skips duplicates (same name and size). Returns counts. */
export async function addLocalSongs(files) {
  const existing = new Set(((await tx("readonly", (store) => store.getAll())) || []).map((r) => r.key));
  const records = [];
  let duplicates = 0;
  for (const file of files) {
    const key = `${file.name}:${file.size}`;
    if (existing.has(key)) { duplicates++; continue; }
    existing.add(key);
    const tags = await readID3(file);
    const fromName = parseFilename(file.name);
    records.push({
      id: `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      key,
      title: tags.title || fromName.title,
      artist: tags.artist || fromName.artist,
      album: tags.album || "",
      cover: tags.cover || null,
      blob: file,
      addedAt: Date.now() + records.length,
    });
  }
  if (records.length) await tx("readwrite", (store) => records.forEach((r) => store.put(r)));
  return { added: records.length, duplicates };
}

export async function removeLocalSong(id) {
  await tx("readwrite", (store) => store.delete(id));
  [id, `${id}:cover`].forEach((key) => {
    if (urlCache.has(key)) URL.revokeObjectURL(urlCache.get(key));
    urlCache.delete(key);
  });
}

export async function updateLocalSong(id, changes) {
  const db = await openDB();
  const record = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (record) await tx("readwrite", (store) => store.put({ ...record, ...changes }));
}

/** Best-effort estimate of how much space the browser gives this site. */
export async function getStorageEstimate() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Ask the browser not to evict stored songs under storage pressure. */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {
    // Not supported: songs are still stored, just evictable.
  }
}
