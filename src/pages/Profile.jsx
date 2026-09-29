import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteDoc, doc } from "firebase/firestore";
import Icon from "../components/Icon";
import SignInDialog from "../components/SignInDialog";
import UsernameForm from "../components/UsernameForm";
import { isRealtimeConfigured } from "../services/firebase";
import { useAuth } from "../state/AuthContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { db } from "../services/firebase";
import { summarise } from "../utils/stats";
import { useSeo } from "../hooks/useSeo";

const PROVIDER_NAMES = {
  "google.com": "Google",
  "apple.com": "Apple",
  password: "Email & password",
  phone: "Phone",
  emailLink: "Email link",
};

function formatHours(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const errorText = (error) =>
  ({
    "auth/wrong-password": "Current password is incorrect.",
    "auth/invalid-credential": "Current password is incorrect.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/requires-recent-login": "For your security, sign out and sign in again, then retry.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  }[error?.code] || "Something went wrong. Please try again.");

function Stat({ value, label }) {
  return (
    <div className="profile__stat">
      <span className="profile__stat-value">{value}</span>
      <span className="profile__stat-label">{label}</span>
    </div>
  );
}

function PasswordForm({ onDone }) {
  const { changePassword } = useAuth();
  const { toast } = useUI();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (next.length < 6) return toast("Choose a password with at least 6 characters.", { tone: "error" });
    setBusy(true);
    try {
      await changePassword(current, next);
      toast("Password changed", { icon: "check" });
      onDone();
    } catch (error) {
      toast(errorText(error), { tone: "error", icon: "warning" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile__form" onSubmit={submit}>
      <label className="profile__field">
        <span>Current password</span>
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="profile__field">
        <span>New password</span>
        <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
      </label>
      <div className="settings__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        <button type="button" className="btn btn--subtle" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/** The listener's account: identity, library at a glance and account management. */
export default function ProfilePage() {
  useSeo({ title: "Profile", noindex: true });
  const { user, ready, enabled, signOut, updateAccountProfile, resendVerification, resetPassword, deleteAccount } = useAuth();
  const { liked, playlists, syncStatus } = useLibrary();
  const { openModal, toast } = useUI();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhoto(user?.photo || "");
  }, [user?.name, user?.photo]);

  const allTime = useMemo(() => summarise(0), []);
  const topDays = Object.values(allTime.perDay).filter((s) => s > 0).length;

  const openSignIn = () => openModal({ title: "Sign in", bare: true, body: <SignInDialog /> });

  const saveProfile = async (event) => {
    event.preventDefault();
    if (photo && !/^https:\/\//i.test(photo.trim())) {
      toast("Photo must be an https:// image link.", { tone: "error" });
      return;
    }
    setSaving(true);
    try {
      await updateAccountProfile({ name, photo });
      toast("Profile updated", { icon: "check" });
      setEditing(false);
    } catch (error) {
      toast(errorText(error), { tone: "error", icon: "warning" });
    } finally {
      setSaving(false);
    }
  };

  const removeAccount = async () => {
    if (!window.confirm("Delete your account? Your synced library will be permanently removed. This can't be undone.")) return;
    try {
      if (db) await deleteDoc(doc(db, "users", user.uid));
      await deleteAccount();
      toast("Account deleted");
      navigate("/");
    } catch (error) {
      toast(errorText(error), { tone: "error", icon: "warning" });
    }
  };

  const signedIn = Boolean(user);
  const isGuest = Boolean(user?.isAnonymous);
  const displayName = isGuest ? "Guest" : user?.name || user?.email || user?.phone || "Listener";
  const providers = (user?.providers || []).map((id) => PROVIDER_NAMES[id] || id);
  const memberSince = formatDate(user?.createdAt);

  return (
    <div className="page profile">
      <header className="profile__hero">
        <div className="profile__avatar">
          {user?.photo ? (
            <img src={user.photo} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span>{signedIn ? displayName.charAt(0).toUpperCase() : <Icon name="artist" size={48} />}</span>
          )}
        </div>
        <div className="profile__identity">
          <span className="profile__eyebrow">Profile</span>
          <h1 className="profile__name">{signedIn ? displayName : "Your profile"}</h1>
          <p className="profile__meta">
            {signedIn && !isGuest && user.email ? <span>{user.email}</span> : null}
            {memberSince ? <span>Member since {memberSince}</span> : null}
            {!signedIn ? <span>Sign in to sync your library across devices.</span> : null}
          </p>
          <div className="profile__badges">
            {isGuest ? <span className="badge badge--warn">Guest account</span> : null}
            {signedIn && !isGuest && user.email ? (
              user.emailVerified ? <span className="badge">Email verified</span> : <span className="badge badge--warn">Email not verified</span>
            ) : null}
            {signedIn ? <span className="badge">{syncStatus === "synced" ? "Library synced" : syncStatus === "syncing" ? "Syncing…" : "Not synced"}</span> : null}
          </div>
        </div>
      </header>

      <section className="settings__group">
        <div className="profile__section-head">
          <h2 className="settings__heading">Your music</h2>
          <Link to="/stats" className="btn btn--subtle">See all stats</Link>
        </div>
        <div className="profile__stats">
          <Stat value={liked.length} label="Liked songs" />
          <Stat value={playlists.length} label="Playlists" />
          <Stat value={allTime.totalPlays} label="Plays" />
          <Stat value={formatHours(allTime.totalSeconds)} label="Listening time" />
          <Stat value={topDays} label="Days listened" />
        </div>
      </section>

      {!enabled ? null : !ready ? null : !signedIn ? (
        <section className="settings__group">
          <h2 className="settings__heading">Account</h2>
          <p className="setting__desc settings__note">Create an account to keep your playlists, likes and history on every device.</p>
          <button type="button" className="btn btn--primary" onClick={openSignIn}>Sign in</button>
        </section>
      ) : (
        <>
          {!isGuest && isRealtimeConfigured ? (
            <section className="settings__group">
              <h2 className="settings__heading">Username</h2>
              <UsernameForm />
            </section>
          ) : null}
          {!isGuest ? (
            <section className="settings__group">
              <div className="profile__section-head">
                <h2 className="settings__heading">Profile details</h2>
                {!editing ? (
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
                    <Icon name="edit" size={16} />
                    <span>Edit</span>
                  </button>
                ) : null}
              </div>
              {editing ? (
                <form className="profile__form" onSubmit={saveProfile}>
                  <label className="profile__field">
                    <span>Display name</span>
                    <input className="input" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </label>
                  <label className="profile__field">
                    <span>Photo URL <small>(optional)</small></span>
                    <input className="input" type="url" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
                  </label>
                  <div className="settings__actions">
                    <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                    <button type="button" className="btn btn--subtle" onClick={() => { setEditing(false); setName(user.name || ""); setPhoto(user.photo || ""); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="profile__details">
                  <dt>Name</dt>
                  <dd>{user.name || "Not set"}</dd>
                  {user.email ? (<><dt>Email</dt><dd>{user.email}</dd></>) : null}
                  {user.phone ? (<><dt>Phone</dt><dd>{user.phone}</dd></>) : null}
                  <dt>Signed in with</dt>
                  <dd>{providers.join(", ") || "—"}</dd>
                  {formatDate(user.lastSignIn) ? (<><dt>Last sign-in</dt><dd>{formatDate(user.lastSignIn)}</dd></>) : null}
                </dl>
              )}
            </section>
          ) : (
            <section className="settings__group">
              <h2 className="settings__heading">Keep your library</h2>
              <p className="setting__desc settings__note">
                You're using a guest account. Sign in to save your library permanently; everything you have now carries over.
              </p>
              <button type="button" className="btn btn--primary" onClick={openSignIn}>Save your library</button>
            </section>
          )}

          <section className="settings__group">
            <h2 className="settings__heading">Security</h2>
            {user.email && !user.emailVerified && !isGuest ? (
              <div className="setting">
                <span className="setting__text">
                  <span className="setting__label">Verify your email</span>
                  <span className="setting__desc">Confirm {user.email} so you can recover your account.</span>
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => resendVerification().then(() => toast("Verification email sent", { icon: "check" }), (e) => toast(errorText(e), { tone: "error" }))}
                >
                  Resend
                </button>
              </div>
            ) : null}
            {user.providers?.includes("password") ? (
              <div className="setting setting--stack">
                <span className="setting__text">
                  <span className="setting__label">Password</span>
                  <span className="setting__desc">Change the password you use to sign in.</span>
                </span>
                {changingPassword ? (
                  <PasswordForm onDone={() => setChangingPassword(false)} />
                ) : (
                  <div className="settings__actions">
                    <button type="button" className="btn btn--ghost" onClick={() => setChangingPassword(true)}>Change password</button>
                    <button
                      type="button"
                      className="btn btn--subtle"
                      onClick={() => resetPassword(user.email).then(() => toast("Reset link sent to your email", { icon: "check" }), (e) => toast(errorText(e), { tone: "error" }))}
                    >
                      Email me a reset link
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            <div className="setting">
              <span className="setting__text">
                <span className="setting__label">Sign out</span>
                <span className="setting__desc">{isGuest ? "Guest libraries can't be recovered after signing out." : "Your library stays saved to your account."}</span>
              </span>
              <button type="button" className="btn btn--ghost" onClick={async () => { await signOut(); navigate("/"); }}>Sign out</button>
            </div>
          </section>

          <section className="settings__group">
            <h2 className="settings__heading profile__danger-heading">Danger zone</h2>
            <div className="setting">
              <span className="setting__text">
                <span className="setting__label">Delete account</span>
                <span className="setting__desc">Permanently removes your account and synced library. Data on this device stays.</span>
              </span>
              <button type="button" className="btn btn--danger" onClick={removeAccount}>
                <Icon name="trash" size={16} />
                <span>Delete</span>
              </button>
            </div>
          </section>
        </>
      )}

      <p className="setting__desc">
        Looking for themes, colours and playback options? <Link to="/settings" className="profile__link">Open Settings</Link>
      </p>
    </div>
  );
}
