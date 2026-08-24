// Firebase production configuration is injected by Vercel VITE_FIREBASE_* environment variables.
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
  type Auth,
  type User
} from 'firebase/auth';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (!firebaseConfigured) {
    throw new Error('Firebase production credentials are not configured.');
  }

  if (!app) {
    app = getApps()[0] || initializeApp(firebaseConfig);
  }
  if (!auth) auth = getAuth(app);
  return auth;
}

export function watchFirebaseUser(callback: (user: User | null) => void): () => void {
  if (!firebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return result.user;
}

export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  return result.user;
}

export async function resetEmailPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function logoutFirebase(): Promise<void> {
  if (firebaseConfigured) await signOut(getFirebaseAuth());
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per usare Ember.');
  return user.getIdToken(forceRefresh);
}

export function getCurrentFirebaseUser(): User | null {
  if (!firebaseConfigured) return null;
  return getFirebaseAuth().currentUser;
}

export async function updateFirebaseUserProfile(displayName: string, photoURL?: string | null): Promise<User> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per aggiornare il profilo.');
  await updateProfile(user, { displayName: displayName.trim(), photoURL: photoURL ?? user.photoURL });
  await user.reload();
  return getFirebaseAuth().currentUser || user;
}

export async function uploadFirebaseAvatar(file: Blob): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per salvare l’avatar.');
  const storage = getStorage(app || getApps()[0] || initializeApp(firebaseConfig));
  const avatarRef = ref(storage, `profile-avatars/${user.uid}/avatar-${Date.now()}.webp`);
  await uploadBytes(avatarRef, file, { contentType: file.type || 'image/webp' });
  const photoURL = await getDownloadURL(avatarRef);
  await updateProfile(user, { photoURL });
  return photoURL;
}

export async function sendCurrentUserVerification(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per verificare l’email.');
  await sendEmailVerification(user);
}

export async function requestFirebaseEmailChange(email: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per cambiare l’email.');
  await verifyBeforeUpdateEmail(user, email.trim());
}

export async function linkCurrentUserWithGoogle(): Promise<User> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per collegare Google.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await linkWithPopup(user, provider);
  return result.user;
}

export async function deleteCurrentFirebaseAccount(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Nessun account autenticato da eliminare.');
  await deleteUser(user);
}
