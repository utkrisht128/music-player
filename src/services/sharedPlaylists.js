/**
 * Shared (collaborative) playlists, kept in Firestore at sharedPlaylists/{id}:
 *   { name, description, artwork, trackIds, tracks, ownerUid, members: [uid],
 *     memberInfo: { uid: { name, photo } }, createdAt, updatedAt }
 *
 * Every member can edit the songs and details; only the owner can delete it.
 * Anyone signed in who has the invite link (/join/<id>) can join. The id is
 * random, so the link itself is the secret. firestore.rules enforces all this.
 *
 * Song edits run in transactions, so two members editing at once never
 * overwrite each other's changes.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { exportYouTubeTracks, importYouTubeTracks } from "./youtube";

const COLLECTION = "sharedPlaylists";

const memberCard = (user) => ({ name: user.name || user.email || "Listener", photo: user.photo || null });

/** Firestore rejects `undefined`; a JSON round-trip drops it. */
const clean = (value) => JSON.parse(JSON.stringify(value));

/** A message fit for a toast, from a Firestore/Firebase error. */
export function describeError(error, fallback = "Something went wrong with the shared playlist.") {
  switch (error?.code) {
    case "permission-denied":
      return "You don't have access to this playlist any more.";
    case "not-found":
      return "This playlist no longer exists.";
    case "unavailable":
    case "failed-precondition":
    case "deadline-exceeded":
      return "You're offline. Shared playlists need a connection to change.";
    case "unauthenticated":
      return "Sign in again to use shared playlists.";
    default:
      return error?.code ? fallback : error?.message || fallback;
  }
}

/** Console log with context, for debugging failed shared-playlist calls. */
export function logError(action, error, extra = {}) {
  // eslint-disable-next-line no-console
  console.error(`[sharedPlaylists] ${action} failed`, { code: error?.code, message: error?.message, ...extra }, error);
}

/** Transactions and first writes need the server; fail fast instead of hanging. */
function requireOnline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const error = new Error("You're offline. Shared playlists need a connection to change.");
    error.code = "unavailable";
    throw error;
  }
}

function notFound() {
  const error = new Error("This playlist no longer exists.");
  error.code = "not-found";
  return error;
}

export function joinUrl(id) {
  return `${window.location.origin}/join/${encodeURIComponent(id)}`;
}

function fromDoc(snap) {
  const d = snap.data() || {};
  if (d.tracks && typeof d.tracks === "object") importYouTubeTracks(d.tracks);
  return {
    id: snap.id,
    name: typeof d.name === "string" ? d.name : "Shared playlist",
    description: typeof d.description === "string" ? d.description : "",
    artwork: typeof d.artwork === "string" ? d.artwork : null,
    trackIds: Array.isArray(d.trackIds) ? d.trackIds.filter((id) => typeof id === "string") : [],
    createdAt: Number(d.createdAt) || Date.now(),
    updatedAt: Number(d.updatedAt) || Date.now(),
    shared: true,
    ownerUid: d.ownerUid || null,
    members: Array.isArray(d.members) ? d.members : [],
    memberInfo: d.memberInfo && typeof d.memberInfo === "object" ? d.memberInfo : {},
  };
}

/** Live list of shared playlists the user belongs to. Returns unsubscribe. */
export function subscribeSharedPlaylists(uid, onChange, onError) {
  const q = query(collection(db, COLLECTION), where("members", "array-contains", uid));
  return onSnapshot(q, (snap) => onChange(snap.docs.map(fromDoc)), onError);
}

/** Turn a playlist into a shared one owned by `user`. Resolves to the new id. */
export async function createSharedPlaylist(user, playlist) {
  requireOnline();
  const ref = doc(collection(db, COLLECTION));
  const now = Date.now();
  await setDoc(
    ref,
    clean({
      name: playlist.name,
      description: playlist.description || "",
      artwork: playlist.artwork || null,
      trackIds: playlist.trackIds || [],
      tracks: exportYouTubeTracks(playlist.trackIds || []),
      ownerUid: user.uid,
      members: [user.uid],
      memberInfo: { [user.uid]: memberCard(user) },
      createdAt: playlist.createdAt || now,
      updatedAt: now,
    })
  );
  return ref.id;
}

/** Read one shared playlist (for the join page). Null if missing. */
export async function getSharedPlaylist(id) {
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? fromDoc(snap) : null;
}

/**
 * Change the song list atomically. `change(trackIds)` returns the new list
 * (or null for "no change"). Details of any new songs travel with it.
 */
export async function changeSharedTracks(id, change) {
  requireOnline();
  const ref = doc(db, COLLECTION, id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw notFound();
    const data = snap.data();
    const current = Array.isArray(data.trackIds) ? data.trackIds : [];
    const next = change(current);
    if (!next) return false;
    const tracks = { ...(data.tracks || {}) };
    Object.entries(exportYouTubeTracks(next)).forEach(([trackId, track]) => {
      if (!tracks[trackId]) tracks[trackId] = track;
    });
    // Drop details of songs no longer in the playlist.
    const keep = new Set(next);
    Object.keys(tracks).forEach((trackId) => { if (!keep.has(trackId)) delete tracks[trackId]; });
    tx.update(ref, clean({ trackIds: next, tracks, updatedAt: Date.now() }));
    return true;
  });
}

export function updateSharedDetails(id, patch) {
  const allowed = {};
  ["name", "description", "artwork"].forEach((key) => {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  });
  return updateDoc(doc(db, COLLECTION, id), clean({ ...allowed, updatedAt: Date.now() }));
}

export async function joinSharedPlaylist(id, user) {
  requireOnline();
  const ref = doc(db, COLLECTION, id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw notFound();
    const data = snap.data();
    if ((data.members || []).includes(user.uid)) return;
    tx.update(ref, {
      members: [...(data.members || []), user.uid],
      memberInfo: { ...(data.memberInfo || {}), [user.uid]: memberCard(user) },
      updatedAt: Date.now(),
    });
  });
}

export async function leaveSharedPlaylist(id, uid) {
  requireOnline();
  const ref = doc(db, COLLECTION, id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const memberInfo = { ...(data.memberInfo || {}) };
    delete memberInfo[uid];
    tx.update(ref, {
      members: (data.members || []).filter((m) => m !== uid),
      memberInfo,
      updatedAt: Date.now(),
    });
  });
}

/** Owner only. */
export function removeSharedMember(id, uid) {
  return leaveSharedPlaylist(id, uid);
}

/** Owner only. */
export function deleteSharedPlaylist(id) {
  return deleteDoc(doc(db, COLLECTION, id));
}
