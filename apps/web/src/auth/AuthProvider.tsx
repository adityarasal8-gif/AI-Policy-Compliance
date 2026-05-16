import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User
} from "firebase/auth";
import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import { firebaseReady, firebaseServices, firebaseSetupMessage } from "./firebase";

export type WorkspaceRole = "admin" | "employee";

export type WorkspaceProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  workspaceId: string;
  workspaceName: string;
};

type SignInInput = {
  email: string;
  password: string;
};

type SignUpInput = SignInInput & {
  role: WorkspaceRole;
  workspaceName: string;
};

type GoogleAuthInput = {
  mode: "login" | "signup";
  role?: WorkspaceRole;
  workspaceName?: string;
};

type AuthContextValue = {
  user: User | null;
  profile: WorkspaceProfile | null;
  loading: boolean;
  error: string;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: (input: GoogleAuthInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Authentication failed. Please try again.";
}

function normalizeProfile(uid: string, data: Record<string, unknown>): WorkspaceProfile {
  return {
    uid,
    email: String(data.email ?? ""),
    displayName: String(data.displayName ?? data.email ?? "Workspace user"),
    role: data.role === "admin" ? "admin" : "employee",
    workspaceId: String(data.workspaceId ?? ""),
    workspaceName: String(data.workspaceName ?? "Workspace")
  };
}

function createProfileFromUser(user: User, workspaceId: string, workspaceName: string, role: WorkspaceRole): WorkspaceProfile {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? user.email?.split("@")[0] ?? "Workspace user",
    role,
    workspaceId,
    workspaceName
  };
}

async function loadProfile(db: Firestore, uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? normalizeProfile(uid, snapshot.data() as Record<string, unknown>) : null;
}

async function loadProfileWithRetry(db: Firestore, uid: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const profile = await loadProfile(db, uid);
    if (profile) {
      return profile;
    }

    if (attempt < 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 75));
    }
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(firebaseReady ? "" : firebaseSetupMessage());
  const provisioningUidRef = useRef<string | null>(null);

  const auth = firebaseServices?.auth ?? null;
  const db = firebaseServices?.db ?? null;

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      setUser(null);
      setProfile(null);
      setError(firebaseSetupMessage());
      return;
    }

    try {
      return onAuthStateChanged(auth, async (nextUser) => {
        setUser(nextUser);

        if (!nextUser) {
          setProfile(null);
          setError("");
          setLoading(false);
          return;
        }

        if (provisioningUidRef.current === nextUser.uid || provisioningUidRef.current === "*") {
          setLoading(false);
          return;
        }

        if (profile?.uid === nextUser.uid) {
          setError("");
          setLoading(false);
          return;
        }

        try {
          const nextProfile = await loadProfileWithRetry(db, nextUser.uid);
          if (!nextProfile) {
            setProfile(null);
            setError("No Firestore workspace profile exists for this account.");
            await firebaseSignOut(auth);
            setLoading(false);
            return;
          }

          setProfile(nextProfile);
          setError("");
        } catch (authError) {
          setProfile(null);
          setError(toMessage(authError));
          await firebaseSignOut(auth);
        } finally {
          setLoading(false);
        }
      });
    } catch (authError) {
      setUser(null);
      setProfile(null);
      setError(toMessage(authError));
      setLoading(false);
      return undefined;
    }
  }, []);

  async function signIn(input: SignInInput) {
    if (!auth || !db) {
      throw new Error(firebaseSetupMessage());
    }

    setError("");
    const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
    const nextProfile = await loadProfileWithRetry(db, credential.user.uid);

    if (!nextProfile) {
      await firebaseSignOut(auth);
      throw new Error("This account does not have an associated Firestore workspace profile.");
    }

    setProfile(nextProfile);
    setLoading(false);
  }

  async function signInWithGoogle(input: GoogleAuthInput) {
    if (!auth || !db) {
      throw new Error(firebaseSetupMessage());
    }

    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    if (input.mode === "signup") {
      provisioningUidRef.current = "*";
    }

    try {
      const credential = await signInWithPopup(auth, provider);

      if (input.mode === "signup") {
        provisioningUidRef.current = credential.user.uid;
      }

      const existingProfile = await loadProfileWithRetry(db, credential.user.uid);

      if (existingProfile) {
        setProfile(existingProfile);
        setLoading(false);
        return;
      }

      if (input.mode === "login") {
        await firebaseSignOut(auth);
        throw new Error("This Google account does not have a workspace profile yet. Use sign up to create one.");
      }

      const workspaceName = input.workspaceName?.trim() || credential.user.displayName || "New Workspace";
      const role = input.role ?? "employee";
      const workspaceRef = doc(collection(db, "workspaces"));
      const nextProfile = createProfileFromUser(credential.user, workspaceRef.id, workspaceName, role);

      setProfile(nextProfile);
      setLoading(false);

      const batch = writeBatch(db);
      batch.set(workspaceRef, {
        name: workspaceName,
        ownerUid: credential.user.uid,
        ownerRole: role,
        createdAt: serverTimestamp()
      });
      batch.set(doc(db, "users", credential.user.uid), {
        ...nextProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error) {
      setProfile(null);
      setError(toMessage(error));
      await firebaseSignOut(auth);
      throw error;
    } finally {
      provisioningUidRef.current = null;
    }
  }

  async function signUp(input: SignUpInput) {
    if (!auth || !db) {
      throw new Error(firebaseSetupMessage());
    }

    setError("");
    provisioningUidRef.current = "*";

    try {
      const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
      provisioningUidRef.current = credential.user.uid;

      const workspaceName = input.workspaceName.trim() || "New Workspace";
      const workspaceRef = doc(collection(db, "workspaces"));

      const nextProfile: WorkspaceProfile = {
        uid: credential.user.uid,
        email: credential.user.email ?? input.email,
        displayName: input.email.split("@")[0] || "Workspace user",
        role: input.role,
        workspaceId: workspaceRef.id,
        workspaceName
      };

      setProfile(nextProfile);
      setLoading(false);

      const batch = writeBatch(db);
      batch.set(workspaceRef, {
        name: workspaceName,
        ownerUid: credential.user.uid,
        ownerRole: input.role,
        createdAt: serverTimestamp()
      });
      batch.set(doc(db, "users", credential.user.uid), {
        ...nextProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error) {
      setProfile(null);
      setError(toMessage(error));
      await firebaseSignOut(auth);
      throw error;
    } finally {
      provisioningUidRef.current = null;
    }
  }

  async function signOut() {
    if (!auth) {
      setError(firebaseSetupMessage());
      return;
    }

    setError("");
    setProfile(null);
    await firebaseSignOut(auth);
  }

  return <AuthContext.Provider value={{ user, profile, loading, error, signIn, signUp, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}