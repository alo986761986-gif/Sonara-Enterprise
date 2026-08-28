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

export type FirebaseVideoAiAsset = {
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  size: number;
  kind: 'image' | 'video' | 'audio';
};

function safeVideoAiFileName(value: string) {
  const clean = String(value || 'media').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean.slice(0, 100) || 'media';
}

function fallbackVideoAiContentType(kind: 'image' | 'video' | 'audio') {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/mpeg';
  return 'image/jpeg';
}

function uploadErrorMessage(payload: any, fallback: string) {
  const message = String(payload?.error?.message || payload?.message || '').trim();
  return message || fallback;
}

export async function uploadFirebaseVideoAiAsset(
  file: Blob,
  options: { fileName?: string; kind?: 'image' | 'video' | 'audio' } = {}
): Promise<FirebaseVideoAiAsset> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Accedi per caricare foto, video e audio in SONARA Video AI.');

  const kind = options.kind || (file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'image');
  const fileName = safeVideoAiFileName(options.fileName || `${kind}-${Date.now()}`);
  const contentType = file.type || fallbackVideoAiContentType(kind);
  const idToken = await user.getIdToken();

  const prepareResponse = await fetch('/api/video/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileName,
      contentType,
      size: file.size,
      kind
    })
  });

  const prepared = await prepareResponse.json().catch(() => ({})) as {
    storagePath?: string;
    uploadUrl?: string;
    downloadUrl?: string;
    error?: { message?: string };
  };

  if (!prepareResponse.ok || !prepared.storagePath || !prepared.uploadUrl || !prepared.downloadUrl) {
    throw new Error(uploadErrorMessage(prepared, 'SONARA non riesce a preparare il caricamento del file.'));
  }

  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file
  });

  if (!uploadResponse.ok) {
    const providerMessage = await uploadResponse.text().catch(() => '');
    console.error('[SONARA VIDEO AI] signed media upload failed', uploadResponse.status, providerMessage.slice(0, 500));
    throw new Error(`Caricamento media SONARA fallito (${uploadResponse.status}).`);
  }

  return {
    storagePath: prepared.storagePath,
    downloadUrl: prepared.downloadUrl,
    contentType,
    size: file.size,
    kind
  };
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
