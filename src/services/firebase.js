/**
 * Firebase app, auth and Firestore.
 *
 * Config comes from REACT_APP_FIREBASE_* env vars (see .env.example). These
 * values are public by design; access to data is enforced by firestore.rules.
 * Without them the app runs exactly as before, with a device-only library.
 */
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const config = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  // Optional: Analytics needs measurementId, Listen Together needs databaseURL.
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  // Offline cache: changes made offline are queued and synced on reconnect.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    db = initializeFirestore(app, {});
  }
}

export const isRealtimeConfigured = isFirebaseConfigured && Boolean(config.databaseURL);
export const isAnalyticsConfigured = isFirebaseConfigured && Boolean(config.measurementId);

export { app, auth, db };
