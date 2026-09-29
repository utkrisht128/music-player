/**
 * Friends and presence on the Realtime Database, next to the Listen Together
 * rooms so the room rules can check friendship.
 *
 *   profiles/{uid}                  { name, photo, username } anyone signed in
 *   emails/{emailKey}               uid                     lookup by exact email
 *   usernames/{username}            uid                     unique, first come first served
 *   friendRequests/{toUid}/{fromUid} { name, photo, at }
 *   sentRequests/{fromUid}/{toUid}  true
 *   friends/{uid}/{friendUid}       true                    both directions
 *   presence/{uid}                  { connections, lastSeen, isPlaying, track, roomCode, roomHost }
 *
 * Presence is readable only by the user's friends. Access is enforced by
 * database.rules.json.
 */
import { app, isRealtimeConfigured } from "./firebase";
import { trackSnapshot } from "./rooms";

export { isRealtimeConfigured };

let dbPromise = null;
function rtdb() {
  if (!dbPromise) {
    dbPromise = import("firebase/database").then((mod) => ({ mod, db: mod.getDatabase(app) }));
  }
  return dbPromise;
}

/** Database keys can't contain "."; the rules derive the same key from the auth token. */
export const emailKey = (email) => String(email || "").trim().toLowerCase().replace(/\./g, ",");

/** 3–20 lowercase letters, numbers or underscores. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const normaliseUsername = (input) => String(input || "").trim().replace(/^@/, "").toLowerCase();

/**
 * Permission errors mean the database rules on Firebase are older than this
 * code (deploy database.rules.json), or the user isn't allowed to do this.
 */
function explain(error, fallback) {
  if (error?.code === "PERMISSION_DENIED" || /permission.denied/i.test(error?.message || "")) {
    return new Error(`${fallback} (permission denied: are the latest database rules deployed?)`);
  }
  return error;
}

const displayName = (user) => user.name || user.email?.split("@")[0] || "Listener";

/** Makes the signed-in user findable by their email and shows their name to friends. */
export async function publishProfile(user) {
  const { mod, db } = await rtdb();
  const profile = { name: displayName(user).slice(0, 100), photo: user.photo || null };
  // update, not set, so the username stored alongside is kept.
  await mod.update(mod.ref(db, `profiles/${user.uid}`), profile);
  if (user.email) await mod.set(mod.ref(db, `emails/${emailKey(user.email)}`), user.uid);
}

/**
 * Marks this tab as connected until it closes. Each tab has its own
 * connection entry, so closing one tab doesn't show the user as offline.
 * Returns a function that disconnects.
 */
export async function goOnline(uid) {
  const { mod, db } = await rtdb();
  const presenceRef = mod.ref(db, `presence/${uid}`);
  let connectionRef = null;
  const off = mod.onValue(mod.ref(db, ".info/connected"), async (s) => {
    if (s.val() !== true) return;
    connectionRef = mod.push(mod.child(presenceRef, "connections"));
    await mod.onDisconnect(connectionRef).remove();
    await mod.onDisconnect(mod.child(presenceRef, "lastSeen")).set(mod.serverTimestamp());
    await mod.set(connectionRef, true);
  });
  return async () => {
    off();
    if (!connectionRef) return;
    try {
      await mod.onDisconnect(connectionRef).cancel();
      await mod.remove(connectionRef);
      await mod.set(mod.child(presenceRef, "lastSeen"), mod.serverTimestamp());
    } catch { /* signed out already */ }
  };
}

/** What friends see: the song, whether it's playing, and the room to join. */
export async function publishActivity(uid, { track, isPlaying, roomCode, roomHost }) {
  const { mod, db } = await rtdb();
  const shareable = track && track.source !== "device";
  await mod.update(mod.ref(db, `presence/${uid}`), {
    track: shareable ? trackSnapshot(track) : null,
    isPlaying: Boolean(shareable && isPlaying),
    roomCode: roomCode || null,
    roomHost: Boolean(roomCode && roomHost),
  });
}

/** Clears what's playing, e.g. when the user hides their activity. */
export async function clearActivity(uid) {
  const { mod, db } = await rtdb();
  await mod.update(mod.ref(db, `presence/${uid}`), { track: null, isPlaying: false, roomCode: null, roomHost: false });
}

/** Streams a path; returns an unsubscribe function. */
export async function watch(path, onValue) {
  const { mod, db } = await rtdb();
  return mod.onValue(mod.ref(db, path), (s) => onValue(s.val()), () => onValue(null));
}

/**
 * Claims a username, releasing the previous one. The rules make the claim
 * atomic, so two people can't both get the same name.
 */
export async function claimUsername(uid, input, previous) {
  const { mod, db } = await rtdb();
  const name = normaliseUsername(input);
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error("Usernames are 3–20 characters: lowercase letters, numbers and _.");
  }
  if (name === previous) return name;
  try {
    const owner = await mod.get(mod.ref(db, `usernames/${name}`)).then((s) => s.val());
    if (owner && owner !== uid) throw new Error(`@${name} is taken.`);
    await mod.set(mod.ref(db, `usernames/${name}`), uid);
    await mod.set(mod.ref(db, `profiles/${uid}/username`), name);
  } catch (error) {
    throw explain(error, `Couldn't save @${name}`);
  }
  if (previous) await mod.remove(mod.ref(db, `usernames/${previous}`)).catch(() => {});
  return name;
}

/** Finds a uid by "@username", "username" or an email address. */
async function lookup(mod, db, user, input) {
  const text = String(input || "").trim();
  if (text.includes("@") && !text.startsWith("@")) {
    const key = emailKey(text);
    if (user.email && key === emailKey(user.email)) throw new Error("That's your own email.");
    const uid = await mod.get(mod.ref(db, `emails/${key}`)).then((s) => s.val());
    if (!uid) throw new Error("No one has signed in with that email yet.");
    return uid;
  }
  const name = normaliseUsername(text);
  if (!USERNAME_PATTERN.test(name)) throw new Error("Enter a username or an email address.");
  const uid = await mod.get(mod.ref(db, `usernames/${name}`)).then((s) => s.val());
  if (!uid) throw new Error(`No one has the username @${name}.`);
  return uid;
}

/**
 * Sends a friend request by username or email. If they already asked us,
 * accepts theirs instead. Resolves "sent", "accepted" or "friends".
 */
export async function sendRequest(user, input) {
  try {
    return await requestFriend(user, input);
  } catch (error) {
    throw explain(error, "Couldn't send the request");
  }
}

async function requestFriend(user, input) {
  const { mod, db } = await rtdb();
  const toUid = await lookup(mod, db, user, input);
  if (toUid === user.uid) throw new Error("That's you!");

  const already = await mod.get(mod.ref(db, `friends/${user.uid}/${toUid}`));
  if (already.exists()) return "friends";
  const theirs = await mod.get(mod.ref(db, `friendRequests/${user.uid}/${toUid}`));
  if (theirs.exists()) {
    await acceptRequest(user.uid, toUid);
    return "accepted";
  }

  const request = { name: displayName(user).slice(0, 100), at: mod.serverTimestamp() };
  if (user.photo) request.photo = user.photo;
  await mod.set(mod.ref(db, `friendRequests/${toUid}/${user.uid}`), request);
  await mod.set(mod.ref(db, `sentRequests/${user.uid}/${toUid}`), true);
  return "sent";
}

export async function acceptRequest(uid, fromUid) {
  const { mod, db } = await rtdb();
  // Friendship is written while the request still exists; the rules require it.
  await mod.update(mod.ref(db), {
    [`friends/${uid}/${fromUid}`]: true,
    [`friends/${fromUid}/${uid}`]: true,
  });
  await mod.update(mod.ref(db), {
    [`friendRequests/${uid}/${fromUid}`]: null,
    [`sentRequests/${fromUid}/${uid}`]: null,
  });
}

/** Declining (as the receiver) and cancelling (as the sender) are the same removal. */
export async function removeRequest(toUid, fromUid) {
  const { mod, db } = await rtdb();
  await mod.update(mod.ref(db), {
    [`friendRequests/${toUid}/${fromUid}`]: null,
    [`sentRequests/${fromUid}/${toUid}`]: null,
  });
}

export async function removeFriend(uid, friendUid) {
  const { mod, db } = await rtdb();
  await mod.update(mod.ref(db), {
    [`friends/${uid}/${friendUid}`]: null,
    [`friends/${friendUid}/${uid}`]: null,
  });
}
