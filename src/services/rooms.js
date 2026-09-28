/**
 * Listen Together rooms on the Realtime Database (free Spark plan: 100
 * simultaneous connections, 1 GB stored, 10 GB/month downloaded).
 *
 *   rooms/{code}
 *     hostUid, createdAt
 *     state:   { trackId, track, isPlaying, position, updatedAt }
 *     members: { [uid]: { name, photo, joinedAt } }
 *
 * The host writes `state` on every play, pause, seek and track change;
 * listeners extrapolate the position from `updatedAt` using the server clock
 * offset, so no per-second writes are needed. Access is enforced by
 * database.rules.json.
 */
import { app, isRealtimeConfigured } from "./firebase";
import { exportYouTubeTracks, importYouTubeTracks, isYouTubeId } from "./youtube";

export { isRealtimeConfigured };

let dbPromise = null;
function rtdb() {
  if (!dbPromise) {
    dbPromise = import("firebase/database").then((mod) => ({ mod, db: mod.getDatabase(app) }));
  }
  return dbPromise;
}

// No 0/O/1/I so codes are easy to read aloud.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export const normaliseCode = (input) => String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

/**
 * What a listener needs to show and play the song. YouTube songs carry their
 * full details, so listeners never need a YouTube API lookup (which fails
 * when the key is referrer-restricted or out of quota).
 */
export function trackSnapshot(track) {
  if (!track) return null;
  const full = isYouTubeId(track.id) && exportYouTubeTracks([track.id])[track.id];
  if (full) return full;
  return {
    id: track.id,
    title: track.title || "",
    artists: track.artists || [],
    artwork: typeof track.artwork === "string" && !track.artwork.startsWith("blob:") ? track.artwork : null,
  };
}

function memberInfo(user) {
  return {
    name: user.name || user.email?.split("@")[0] || "Guest",
    photo: user.photo || null,
    joinedAt: Date.now(),
  };
}

export async function createRoom(user) {
  const { mod, db } = await rtdb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    const roomRef = mod.ref(db, `rooms/${code}`);
    // eslint-disable-next-line no-await-in-loop
    const existing = await mod.get(roomRef);
    if (existing.exists()) continue;
    // eslint-disable-next-line no-await-in-loop
    await mod.set(roomRef, {
      hostUid: user.uid,
      createdAt: mod.serverTimestamp(),
      state: { trackId: "", isPlaying: false, position: 0, updatedAt: mod.serverTimestamp() },
      members: { [user.uid]: memberInfo(user) },
    });
    return code;
  }
  throw new Error("Couldn't create a room. Please try again.");
}

/**
 * Joins (or rejoins) a room and streams it. `onRoom` gets the room value, or
 * null once it is gone. Returns a function that leaves and unsubscribes.
 */
export async function joinRoom(code, user, onRoom, onError) {
  const { mod, db } = await rtdb();
  const roomRef = mod.ref(db, `rooms/${code}`);
  const snapshot = await mod.get(roomRef);
  if (!snapshot.exists()) return null;

  const isHost = snapshot.val().hostUid === user.uid;
  const meRef = mod.ref(db, `rooms/${code}/members/${user.uid}`);
  await mod.set(meRef, memberInfo(user));
  mod.onDisconnect(meRef).remove();
  // A host that drops off pauses the room rather than deleting it, so a
  // page refresh doesn't end the session for everyone.
  if (isHost) mod.onDisconnect(mod.ref(db, `rooms/${code}/state/isPlaying`)).set(false);

  let offset = 0;
  const offOffset = mod.onValue(mod.ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  const offRoom = mod.onValue(
    roomRef,
    (s) => onRoom(s.exists() ? s.val() : null),
    (error) => onError?.(error)
  );

  const leave = async () => {
    offRoom();
    offOffset();
    try {
      await mod.onDisconnect(meRef).cancel();
      await mod.remove(meRef);
    } catch { /* room already deleted */ }
  };
  leave.serverNow = () => Date.now() + offset;
  leave.isHost = isHost;
  return leave;
}

export async function publishState(code, state) {
  const { mod, db } = await rtdb();
  await mod.set(mod.ref(db, `rooms/${code}/state`), { ...state, updatedAt: mod.serverTimestamp() });
}

export async function endRoom(code) {
  const { mod, db } = await rtdb();
  await mod.remove(mod.ref(db, `rooms/${code}`));
}

/** Make the host's YouTube song playable here without an API call. */
export function rememberRoomTrack(snapshot) {
  if (snapshot && isYouTubeId(snapshot.id)) importYouTubeTracks({ [snapshot.id]: snapshot });
}

/** Where the host is now, in seconds, given the shared state. */
export function expectedPosition(state, serverNow) {
  if (!state) return 0;
  const base = Number(state.position) || 0;
  if (!state.isPlaying || typeof state.updatedAt !== "number") return base;
  return base + Math.max(0, serverNow - state.updatedAt) / 1000;
}
