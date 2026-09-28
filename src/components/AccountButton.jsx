import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import SignInDialog from "./SignInDialog";
import { useAuth } from "../state/AuthContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";

const STATUS_TEXT = {
  synced: "Library synced",
  syncing: "Syncing…",
  offline: "Offline – will sync when back online",
  off: "Not synced",
};

/**
 * Top-bar account control. Signed out: a "Sign in" pill that opens the
 * sign-in dialog (Google or email/password). Signed in: the
 * avatar with a small sync-status dot, opening a menu with sign-out.
 * Renders nothing when Firebase is not configured.
 */
export default function AccountButton() {
  const { user, ready, enabled, signOut, completeEmailLink } = useAuth();
  const { syncStatus } = useLibrary();
  const { openMenu, openModal, toast } = useUI();
  const linkChecked = useRef(false);
  const navigate = useNavigate();

  const openSignIn = (initialScreen) =>
    openModal({ title: "Sign in", bare: true, body: <SignInDialog initialScreen={initialScreen} /> });

  // Opened from an email sign-in link: finish signing in.
  useEffect(() => {
    if (!ready || linkChecked.current) return;
    linkChecked.current = true;
    completeEmailLink()
      .then((result) => {
        if (result === "done") toast("Signed in", { icon: "check" });
        if (result === "need-email") openSignIn("finishLink");
      })
      .catch(() => toast("This sign-in link has expired or was already used.", { tone: "error", icon: "warning" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!enabled || !ready) return null;

  if (!user) {
    return (
      <button
        type="button"
        className="account-signin"
        onClick={() => openSignIn()}
        title="Sign in to sync your library across devices"
      >
        <Icon name="artist" size={16} />
        <span>Sign in</span>
      </button>
    );
  }

  const label = user.isAnonymous ? "Guest" : user.name || user.email || user.phone || "Account";

  return (
    <button
      type="button"
      className="account-avatar"
      aria-label={`Account: ${label}. ${STATUS_TEXT[syncStatus]}`}
      title={`${label} · ${STATUS_TEXT[syncStatus]}`}
      aria-haspopup="menu"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        openMenu(
          [
            { label: `${label} · Profile`, icon: "artist", onSelect: () => navigate("/profile") },
            { label: "Settings", icon: "settings", onSelect: () => navigate("/settings") },
            { label: STATUS_TEXT[syncStatus], icon: syncStatus === "synced" ? "check" : "clock", onSelect: () => {} },
            ...(user.isAnonymous
              ? [{ label: "Save your library: sign in", icon: "plus", separatorBefore: true, onSelect: () => openSignIn() }]
              : []),
            {
              label: "Sign out",
              icon: "close",
              danger: true,
              separatorBefore: true,
              onSelect: async () => {
                await signOut();
                toast(
                  user.isAnonymous
                    ? "Signed out. Guest libraries can't be recovered."
                    : "Signed out. Your library is saved to your account."
                );
              },
            },
          ],
          { x: rect.right - 220, y: rect.bottom + 8 }
        );
      }}
    >
      {user.photo ? (
        <img src={user.photo} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="account-avatar__initial">{label.charAt(0).toUpperCase()}</span>
      )}
      <span className={`account-avatar__dot is-${syncStatus}`} aria-hidden="true" />
    </button>
  );
}
