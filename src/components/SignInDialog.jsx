import React, { useState } from "react";
import Icon from "./Icon";
import { useAuth } from "../state/AuthContext";
import { useUI } from "../state/UIContext";

// Turned off for now: phone needs the Blaze plan for real SMS, and Apple
// needs an Apple Developer account. Flip to true to bring them back.
const SHOW_PHONE = false;
const SHOW_APPLE = false;

const ERROR_TEXT = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "You're offline. Check your connection and try again.",
  "auth/account-exists-with-different-credential":
    "You already have an account with this email. Sign in the way you did before.",
  "auth/billing-not-enabled": "Phone sign-in needs the Firebase Blaze plan. Use a test number or another method for now.",
  "auth/invalid-app-credential": "Phone check failed (reCAPTCHA). Make sure this domain is authorized in Firebase.",
  "auth/captcha-check-failed": "Phone check failed (reCAPTCHA). Refresh the page and try again.",
  "auth/unauthorized-domain": "This website isn't authorized for sign-in yet (Firebase → Authorized domains).",
  "auth/operation-not-allowed": "This sign-in method isn't enabled yet.",
  "auth/admin-restricted-operation": "This sign-in method isn't enabled yet.",
  "auth/invalid-phone-number": "Enter the number with its country code, e.g. +91 98765 43210.",
  "auth/missing-phone-number": "Enter your phone number.",
  "auth/invalid-verification-code": "That code isn't right. Check the SMS and try again.",
  "auth/code-expired": "That code has expired. Send a new one.",
  "auth/quota-exceeded": "SMS limit reached for today. Try another sign-in method.",
  "auth/invalid-action-code": "This sign-in link has expired or was already used. Request a new one.",
  "auth/expired-action-code": "This sign-in link has expired. Request a new one.",
};

const errorText = (error) =>
  ERROR_TEXT[error?.code] || `Something went wrong. Please try again.${error?.code ? ` (${error.code})` : ""}`;

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const AppleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.62c-.02-2.3 1.88-3.41 1.97-3.46-1.07-1.57-2.74-1.78-3.33-1.8-1.42-.14-2.77.83-3.49.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.36 2.88 2.31 1.16-.05 1.59-.75 2.99-.75 1.4 0 1.79.75 3.01.72 1.24-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.45-3.71zM14.08 5.87c.64-.77 1.07-1.85.95-2.92-.92.04-2.03.61-2.69 1.38-.59.68-1.11 1.78-.97 2.83 1.02.08 2.07-.52 2.71-1.29z" />
  </svg>
);

const Glyph = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const MAIL = "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm-1 1 9 7 9-7";
const PHONE = "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2";
const BACK = "M15 18l-6-6 6-6";

const HEADINGS = {
  home: ["Sign in to Resonate", "Keep your playlists and likes in sync on every device."],
  email: ["Continue with email", null],
  signup: ["Create your account", "It's free. Your library comes with you."],
  reset: ["Reset your password", "We'll email you a link to choose a new one."],
  phone: ["Continue with phone", "We'll text you a 6-digit code."],
  finishLink: ["Confirm your email", "You opened the sign-in link on a different device. Enter the email you used."],
};

/**
 * Sign-in dialog. Screens: home (provider list), email (password or magic
 * link), signup, reset, phone (number, then code) and finishLink (completing
 * an email link opened on another device).
 */
export default function SignInDialog({ initialScreen = "home" }) {
  const auth = useAuth();
  const { closeModal, toast } = useUI();
  const [screen, setScreen] = useState(initialScreen);
  const [emailMethod, setEmailMethod] = useState("password"); // or "link"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = (next) => {
    setScreen(next);
    setError("");
    setSent(false);
  };

  const run = async (action, onDone) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      onDone?.(result);
    } catch (err) {
      console.error("Sign-in failed:", err); // eslint-disable-line no-console
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const done = (message) => {
    closeModal();
    if (message) toast(message, { icon: "check" });
  };

  const [title, subtitle] = HEADINGS[screen];
  const wasGuest = auth.user?.isAnonymous;

  const submitEmail = (event) => {
    event.preventDefault();
    if (emailMethod === "link") {
      run(() => auth.sendEmailLink(email), () => setSent(true));
    } else {
      run(() => auth.signInWithEmail(email, password), () => done("Signed in"));
    }
  };

  const submitSignup = (event) => {
    event.preventDefault();
    run(
      () => auth.signUpWithEmail(name, email, password),
      () => done("Account created. Check your inbox to verify your email.")
    );
  };

  const submitReset = (event) => {
    event.preventDefault();
    // Report success either way so the form can't reveal which emails exist.
    run(
      () => auth.resetPassword(email).catch((err) => (err?.code === "auth/user-not-found" ? null : Promise.reject(err))),
      () => setSent(true)
    );
  };

  const submitPhone = (event) => {
    event.preventDefault();
    if (!confirmCode) {
      run(() => auth.sendPhoneCode(phone.replace(/[\s-]/g, ""), "recaptcha-container"), (confirm) => setConfirmCode(() => confirm));
    } else {
      run(() => confirmCode(code.trim()), () => done("Signed in"));
    }
  };

  const submitFinishLink = (event) => {
    event.preventDefault();
    run(() => auth.completeEmailLink(email), () => done("Signed in"));
  };

  const errorBox = error && (
    <p className="signin__error" role="alert">
      {error}
    </p>
  );

  const emailField = (
    <label className="field">
      <span className="field__label">Email</span>
      <input
        className="field__input"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
    </label>
  );

  const sentNotice = (text) => (
    <div className="signin__sent" role="status">
      <span className="signin__sent-icon">
        <Glyph d={MAIL} />
      </span>
      <p>{text}</p>
    </div>
  );

  return (
    <div className="signin">
      {screen !== "home" && screen !== "finishLink" && (
        <button
          type="button"
          className="icon-btn signin__back"
          aria-label="Back"
          onClick={() => {
            setConfirmCode(null);
            setCode("");
            go(screen === "signup" || screen === "reset" ? "email" : "home");
          }}
        >
          <Glyph d={BACK} />
        </button>
      )}

      <header className="signin__header">
        {screen === "home" && (
          <span className="signin__logo">
            <Icon name="music" size={28} />
          </span>
        )}
        <h2 className="signin__title">{title}</h2>
        {subtitle && <p className="signin__subtitle">{subtitle}</p>}
      </header>

      {screen === "home" && (
        <>
          <div className="signin__providers">
            <button type="button" className="signin__provider" disabled={busy} onClick={() => run(auth.signIn, () => done())}>
              <GoogleLogo />
              <span>Continue with Google</span>
            </button>
            {SHOW_APPLE && (
              <button type="button" className="signin__provider" disabled={busy} onClick={() => run(auth.signInWithApple, () => done())}>
                <AppleLogo />
                <span>Continue with Apple</span>
              </button>
            )}
            <button type="button" className="signin__provider" disabled={busy} onClick={() => go("email")}>
              <Glyph d={MAIL} />
              <span>Continue with email</span>
            </button>
            {SHOW_PHONE && (
              <button type="button" className="signin__provider" disabled={busy} onClick={() => go("phone")}>
                <Glyph d={PHONE} />
                <span>Continue with phone</span>
              </button>
            )}
          </div>
          {errorBox}
          {!wasGuest && (
            <>
              <div className="signin__divider">
                <span>or</span>
              </div>
              <button
                type="button"
                className="signin__guest"
                disabled={busy}
                onClick={() => run(auth.signInAsGuest, () => done("You're in as a guest. Create an account any time to keep your library."))}
              >
                Continue as guest
              </button>
              <p className="signin__fineprint">Guest libraries sync on this device only until you add a sign-in method.</p>
            </>
          )}
        </>
      )}

      {screen === "email" && (
        <form onSubmit={submitEmail}>
          <div className="signin__tabs" role="tablist">
            {[
              ["password", "Password"],
              ["link", "Email me a link"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={emailMethod === key}
                className={`signin__tab${emailMethod === key ? " is-active" : ""}`}
                onClick={() => {
                  setEmailMethod(key);
                  setError("");
                  setSent(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {sent ? (
            sentNotice(`We sent a sign-in link to ${email.trim()}. Open it on this device to finish signing in.`)
          ) : (
            <>
              {emailField}
              {emailMethod === "password" && (
                <label className="field">
                  <span className="field__label signin__label-row">
                    Password
                    <button type="button" className="signin__link" onClick={() => go("reset")}>
                      Forgot password?
                    </button>
                  </span>
                  <input
                    className="field__input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
              )}
              {errorBox}
              <button type="submit" className="btn btn--primary signin__submit" disabled={busy}>
                {busy ? "Please wait…" : emailMethod === "link" ? "Send sign-in link" : "Sign in"}
              </button>
            </>
          )}

          <p className="signin__switch">
            New to Resonate?{" "}
            <button type="button" className="signin__link" onClick={() => go("signup")}>
              Create an account
            </button>
          </p>
        </form>
      )}

      {screen === "signup" && (
        <form onSubmit={submitSignup}>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={60}
              placeholder="What should we call you?"
            />
          </label>
          {emailField}
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="field__input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              placeholder="At least 6 characters"
              required
            />
          </label>
          {errorBox}
          <button type="submit" className="btn btn--primary signin__submit" disabled={busy}>
            {busy ? "Please wait…" : "Create account"}
          </button>
          <p className="signin__switch">
            Already have an account?{" "}
            <button type="button" className="signin__link" onClick={() => go("email")}>
              Sign in
            </button>
          </p>
        </form>
      )}

      {screen === "reset" && (
        <form onSubmit={submitReset}>
          {sent ? (
            sentNotice(`If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox and spam folder.`)
          ) : (
            <>
              {emailField}
              {errorBox}
              <button type="submit" className="btn btn--primary signin__submit" disabled={busy}>
                {busy ? "Please wait…" : "Send reset link"}
              </button>
            </>
          )}
        </form>
      )}

      {screen === "phone" && (
        <form onSubmit={submitPhone}>
          {!confirmCode ? (
            <label className="field">
              <span className="field__label">Phone number</span>
              <input
                className="field__input"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="+91 98765 43210"
                required
              />
            </label>
          ) : (
            <label className="field">
              <span className="field__label signin__label-row">
                Code sent to {phone}
                <button
                  type="button"
                  className="signin__link"
                  onClick={() => {
                    setConfirmCode(null);
                    setCode("");
                    setError("");
                  }}
                >
                  Change number
                </button>
              </span>
              <input
                className="field__input signin__code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                required
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </label>
          )}
          {errorBox}
          <button type="submit" className="btn btn--primary signin__submit" disabled={busy}>
            {busy ? "Please wait…" : confirmCode ? "Verify and sign in" : "Send code"}
          </button>
          {!confirmCode && <p className="signin__fineprint">Standard SMS rates may apply.</p>}
          <div id="recaptcha-container" />
        </form>
      )}

      {screen === "finishLink" && (
        <form onSubmit={submitFinishLink}>
          {emailField}
          {errorBox}
          <button type="submit" className="btn btn--primary signin__submit" disabled={busy}>
            {busy ? "Please wait…" : "Finish signing in"}
          </button>
        </form>
      )}
    </div>
  );
}
