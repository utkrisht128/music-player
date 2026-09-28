import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  PhoneAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../services/firebase";
import { setAnalyticsUser } from "../services/analytics";

/**
 * Signed-in user (Google, Apple, email/password, email link, phone or guest).
 * A guest who later signs in with a new account is upgraded in place
 * (same uid), so their library carries over. `user` is null when signed out; `ready` turns true
 * once Firebase has restored any previous session, so the UI does not flash
 * "Sign in" for a user who is already signed in.
 */
const AuthContext = createContext(null);

const toUser = (u) =>
  u
    ? {
        uid: u.uid,
        name: u.displayName,
        email: u.email,
        phone: u.phoneNumber,
        photo: u.photoURL,
        isAnonymous: u.isAnonymous,
        emailVerified: u.emailVerified,
        providers: u.providerData.map((p) => p.providerId),
        createdAt: u.metadata?.creationTime || null,
        lastSignIn: u.metadata?.lastSignInTime || null,
      }
    : null;

const EMAIL_LINK_KEY = "resonate.emailForSignIn";

/** Popup sign-in for OAuth providers (Google, Apple), linking guests. */
async function popupSignIn(provider) {
  try {
    if (isGuest()) {
      try {
        await linkWithPopup(auth.currentUser, provider);
        return;
      } catch (error) {
        if (error?.code !== "auth/credential-already-in-use") throw error;
      }
    }
    await signInWithPopup(auth, provider);
  } catch (error) {
    // Popups are often blocked on phones / in-app browsers: fall back.
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (error?.code !== "auth/popup-closed-by-user" && error?.code !== "auth/cancelled-popup-request") {
      throw error;
    }
  }
}

const isGuest = () => Boolean(auth?.currentUser?.isAnonymous);

/**
 * Link a credential to the current guest so their library is kept; if the
 * credential already belongs to an account, just sign into that account.
 */
async function signInOrLink(credential) {
  if (isGuest()) {
    try {
      return await linkWithCredential(auth.currentUser, credential);
    } catch (error) {
      if (error?.code !== "auth/credential-already-in-use" && error?.code !== "auth/email-already-in-use") throw error;
    }
  }
  return signInWithCredential(auth, credential);
}


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return undefined;
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, (next) => {
      setUser(toUser(next));
      setAnalyticsUser(next?.uid);
      setReady(true);
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await popupSignIn(provider);
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!auth) return;
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    await popupSignIn(provider);
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!auth) return;
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUpWithEmail = useCallback(async (name, email, password) => {
    if (!auth) return;
    const { user: created } = isGuest()
      ? await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email.trim(), password))
      : await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(created, { displayName: name.trim() });
      // onAuthStateChanged already fired without the name; publish it now.
      setUser(toUser(created));
    }
    sendEmailVerification(created).catch(() => {});
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!auth) return;
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const sendEmailLink = useCallback(async (email) => {
    if (!auth) return;
    const url = `${window.location.origin}${window.location.pathname}`;
    await sendSignInLinkToEmail(auth, email.trim(), { url, handleCodeInApp: true });
    try {
      window.localStorage.setItem(EMAIL_LINK_KEY, email.trim());
    } catch {
      // Private mode: the user is asked for their email when they return.
    }
  }, []);

  /**
   * Finish an email-link sign-in when the page was opened from the link.
   * Resolves "none" (not a sign-in link), "need-email" (link opened on another
   * device: call again with the email) or "done".
   */
  const completeEmailLink = useCallback(async (typedEmail) => {
    if (!auth || !isSignInWithEmailLink(auth, window.location.href)) return "none";
    let email = typedEmail || null;
    try {
      email = email || window.localStorage.getItem(EMAIL_LINK_KEY);
    } catch {
      // ignore
    }
    if (!email) return "need-email";
    await signInOrLink(EmailAuthProvider.credentialWithLink(email.trim(), window.location.href));
    try {
      window.localStorage.removeItem(EMAIL_LINK_KEY);
    } catch {
      // ignore
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    return "done";
  }, []);

  /**
   * Send an SMS code. `containerId` is an empty element for the invisible
   * reCAPTCHA. Resolves to a `confirm(code)` function.
   */
  const sendPhoneCode = useCallback(async (phoneNumber, containerId) => {
    if (!auth) return null;
    const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
    try {
      if (isGuest()) {
        const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(phoneNumber, verifier);
        return (code) => signInOrLink(PhoneAuthProvider.credential(verificationId, code));
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      return (code) => confirmation.confirm(code);
    } finally {
      verifier.clear();
    }
  }, []);

  const signInAsGuest = useCallback(async () => {
    if (!auth) return;
    await signInAnonymously(auth);
  }, []);

  const signOut = useCallback(() => (auth ? firebaseSignOut(auth) : Promise.resolve()), []);

  /** Change display name and/or photo URL (null clears the photo). */
  const updateAccountProfile = useCallback(async ({ name, photo }) => {
    if (!auth?.currentUser) return;
    const patch = {};
    if (name !== undefined) patch.displayName = name.trim() || null;
    if (photo !== undefined) patch.photoURL = photo ? photo.trim() : null;
    await updateProfile(auth.currentUser, patch);
    await auth.currentUser.reload();
    setUser(toUser(auth.currentUser));
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth?.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  /** Email/password accounts only: re-checks the current password first. */
  const changePassword = useCallback(async (currentPassword, nextPassword) => {
    const current = auth?.currentUser;
    if (!current?.email) return;
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
    await updatePassword(current, nextPassword);
  }, []);

  /**
   * Delete the Firebase account. Throws auth/requires-recent-login if the
   * session is old; the caller should ask the user to sign in again.
   */
  const deleteAccount = useCallback(async () => {
    if (!auth?.currentUser) return;
    await deleteUser(auth.currentUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      enabled: isFirebaseConfigured,
      signIn,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      sendEmailLink,
      completeEmailLink,
      sendPhoneCode,
      signInAsGuest,
      signOut,
      updateAccountProfile,
      resendVerification,
      changePassword,
      deleteAccount,
    }),
    [
      user,
      ready,
      signIn,
      signInWithApple,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      sendEmailLink,
      completeEmailLink,
      sendPhoneCode,
      signInAsGuest,
      signOut,
      updateAccountProfile,
      resendVerification,
      changePassword,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
  return context;
}
