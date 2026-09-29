import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import { useFriends } from "../state/FriendsContext";
import { useUI } from "../state/UIContext";

/**
 * Shows the user's @username with a Change button, or a form to pick one.
 * `onDone` runs after a successful save.
 */
export default function UsernameForm({ onDone, extraAction = null, className = "" }) {
  const { username, setUsername } = useFriends();
  const { toast } = useUI();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const name = await setUsername(value);
      toast(`Your username is @${name}.`, { icon: "check" });
      setEditing(false);
      onDone?.(name);
    } catch (error) {
      toast(error.message || "Couldn't save the username.", { tone: "error", icon: "warning" });
    } finally {
      setBusy(false);
    }
  };

  if (username && !editing) {
    return (
      <div className={`friends__me ${className}`}>
        <span>Your username: <strong>@{username}</strong></span>
        <button type="button" className="btn btn--small" onClick={() => { setValue(username); setEditing(true); }}>Change</button>
      </div>
    );
  }

  return (
    <form className={`room__card friends__add ${className}`} onSubmit={save}>
      <h2>{username ? "Change your username" : "Pick a username"}</h2>
      <p>Friends can add you with it. 3–20 characters: lowercase letters, numbers and _.</p>
      <div className="room__join">
        <input
          className="field__input"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          placeholder="your_name"
          aria-label="Username"
          autoComplete="off"
          maxLength={20}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !value.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
        {username ? <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button> : extraAction}
      </div>
    </form>
  );
}

const dismissKey = (uid) => `resonate.usernamePromptDismissed.${uid}`;

/**
 * Asks accounts that don't have a username yet (including ones created
 * before usernames existed) to pick one. "Later" hides it on this device;
 * it can still be set from Friends or Profile.
 */
export function UsernamePrompt() {
  const { enabled, signedIn, uid, profileLoaded, username } = useFriends();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => new Set());

  let stored = false;
  try {
    stored = Boolean(uid && window.localStorage.getItem(dismissKey(uid)));
  } catch {
    // Private mode: only this visit's dismissal counts.
  }

  // The Friends and Profile pages show the form themselves.
  const onOwnPage = pathname.startsWith("/friends") || pathname.startsWith("/profile");
  if (!enabled || !signedIn || !profileLoaded || username || onOwnPage || stored || dismissed.has(uid)) return null;

  const later = () => {
    setDismissed((prev) => new Set(prev).add(uid));
    try {
      window.localStorage.setItem(dismissKey(uid), "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="username-prompt" role="region" aria-label="Pick a username">
      <span className="username-prompt__icon"><Icon name="people" size={20} /></span>
      <UsernameForm
        className="username-prompt__form"
        extraAction={<button type="button" className="btn" onClick={later}>Later</button>}
      />
    </div>
  );
}
