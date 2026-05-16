import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function isPresent(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function looksConfigured() {
  return (
    isPresent(firebaseConfig.apiKey) &&
    isPresent(firebaseConfig.authDomain) &&
    isPresent(firebaseConfig.projectId) &&
    isPresent(firebaseConfig.storageBucket) &&
    isPresent(firebaseConfig.messagingSenderId) &&
    isPresent(firebaseConfig.appId) &&
    !String(firebaseConfig.apiKey).startsWith("VITE_FIREBASE_") &&
    !String(firebaseConfig.apiKey).startsWith("your_")
  );
}

export const firebaseReady = looksConfigured();

export const firebaseServices = firebaseReady
  ? (() => {
      const app = initializeApp(firebaseConfig);
      return {
        auth: getAuth(app),
        db: getFirestore(app)
      };
    })()
  : null;

export function firebaseSetupMessage() {
  return "Firebase is not configured yet. Add the VITE_FIREBASE_* values to start auth.";
}