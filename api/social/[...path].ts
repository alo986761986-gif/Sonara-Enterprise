import { randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const config = { api: { bodyParser: false } };

interface AuthenticatedUser {
  uid: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
}

interface Hub {
  id: string;
  name: string;
  country: string;
  flag: string;
  latitude: number;
  longitude: number;
}

const HUBS: Hub[] = [
  { id: 'city-naples', name: 'Napoli', country: 'Italia', flag: '🇮🇹', latitude: 40.8518, longitude: 14.2681 },
  { id: 'city-rome', name: 'Roma', country: 'Italia', flag: '🇮🇹', latitude: 41.9028, longitude: 12.4964 },
  { id: 'city-milan', name: 'Milano', country: 'Italia', flag: '🇮🇹', latitude: 45.4642, longitude: 9.1900 },
  { id: 'city-london', name: 'Londra', country: 'Regno Unito', flag: '🇬🇧', latitude: 51.5074, longitude: -0.1278 },
  { id: 'city-paris', name: 'Parigi', country: 'Francia', flag: '🇫🇷', latitude: 48.8566, longitude: 2.3522 },
  { id: 'city-berlin', name: 'Berlino', country: 'Germania', flag: '🇩🇪', latitude: 52.52, longitude: 13.405 },
  { id: 'city-barcelona', name: 'Barcellona', country: 'Spagna', flag: '🇪🇸', latitude: 41.3851, longitude: 2.1734 },
  { id: 'city-new-york', name: 'New York', country: 'Stati Uniti', flag: '🇺🇸', latitude: 40.7128, longitude: -74.006 },
  { id: 'city-los-angeles', name: 'Los Angeles', country: 'Stati Uniti', flag: '🇺🇸', latitude: 34.0522, longitude: -118.2437 },
  { id: 'city-sao-paulo', name: 'São Paulo', country: 'Brasile', flag: '🇧🇷', latitude: -23.5505, longitude: -46.6333 },
  { id: 'city-lagos', name: 'Lagos', country: 'Nigeria', flag: '🇳🇬', latitude: 6.5244, longitude: 3.3792 },
  { id: 'city-tokyo', name: 'Tokyo', country: 'Giappone', flag: '🇯🇵', latitude: 35.6762, longitude: 139.6503 },
  { id: 'city-seoul', name: 'Seoul', country: 'Corea del Sud', flag: '🇰🇷', latitude: 37.5665, longitude: 126.978 },
  { id: 'city-sydney', name: 'Sydney', country: 'Australia', flag: '🇦🇺', latitude: -33.8688, longitude: 151.2093 }
];

const ALLOWED_ROLES = new Set(['Artist', 'Producer', 'DJ', 'Studio', 'Label', 'Songwriter', 'Vocalist', 'Instrumentalist', 'AI Creator']);
const ALLOWED_ROOM_KINDS = new Set(['Studio aperto', 'Listening Session', 'Produzione', 'Remix Session', 'Feedback Room']);
const db = () => getFirestore(getAdminApp());
let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return existing;
  }
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '').trim();
  const storageBucket = String(process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  adminApp = initializeApp({
    credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
    ...(projectId ? { projectId } : {}),
    ...(storageBucket ? { storageBucket } : {})
  });
  return adminApp;
}

function json(res: any, status: number, body: Record<string, unknown>) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function errorResponse(res: any, status: number, code: string, message: string) {
  return json(res, status, { error: { code, message } });
}

async function readRawBody(req: any, maxBytes = 9 * 1024 * 1024): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: any): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function bearerToken(req: any): string {
  return String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function authenticatedUser(req: any): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  const apiKey = String(process.env.VITE_FIREBASE_API_KEY || process.env.SONARA_FIREBASE_API_KEY || '').trim();
  if (!token || !apiKey) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!response.ok) return null;
    const payload = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string; photoUrl?: string }> };
    const account = payload.users?.[0];
    return account?.localId ? {
      uid: account.localId,
      email: account.email,
      displayName: account.displayName,
      photoUrl: account.photoUrl
    } : null;
  } catch {
    return null;
  }
}

function actionFromRequest(req: any): string {
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  if (queryPath) return queryPath.replace(/^\/+|\/+$/g, '').toLowerCase();
  const pathname = String(req.url || req.originalUrl || '').split(/[?#]/, 1)[0];
  return String(pathname.match(/\/api\/social(?:\/(.*))?\/?$/i)?.[1] || '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function iso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  return null;
}

function cleanText(value: unknown, max = 300): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function cleanGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => cleanText(item, 40)).filter(Boolean))).slice(0, 8);
}

function hubById(id: unknown): Hub | null {
  return HUBS.find(item => item.id === String(id || '')) || null;
}

function publicProfile(uid: string, data: Record<string, any>) {
  const hub = hubById(data.cityId);
  const onlineUntil = data.onlineUntil instanceof Timestamp ? data.onlineUntil.toMillis() : 0;
  return {
    uid,
    displayName: cleanText(data.displayName || 'Creator SONARA', 80),
    photoURL: String(data.photoURL || ''),
    bio: cleanText(data.bio, 220),
    role: ALLOWED_ROLES.has(data.role) ? data.role : 'Artist',
    genres: cleanGenres(data.genres),
    languages: Array.isArray(data.languages) ? data.languages.map((v: unknown) => cleanText(v, 30)).filter(Boolean).slice(0, 6) : [],
    cityId: hub?.id || null,
    city: hub?.name || '',
    country: hub?.country || '',
    flag: hub?.flag || '',
    latitude: hub?.latitude ?? null,
    longitude: hub?.longitude ?? null,
    discoverable: Boolean(data.discoverable && hub),
    online: onlineUntil > Date.now(),
    lastSeenAt: iso(data.lastSeenAt),
    updatedAt: iso(data.updatedAt)
  };
}

async function ensureProfile(user: AuthenticatedUser, body: Record<string, any> = {}) {
  const ref = db().collection('sonaraSocialProfiles').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      displayName: cleanText(body.displayName || user.displayName || user.email?.split('@')[0] || 'Creator SONARA', 80),
      photoURL: String(body.photoURL || user.photoUrl || ''),
      bio: '',
      role: 'Artist',
      genres: [],
      languages: [],
      cityId: null,
      discoverable: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      onlineUntil: Timestamp.fromMillis(Date.now() + 90_000)
    });
  }
  return (await ref.get()).data() || {};
}

async function bootstrap(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const data = await ensureProfile(user, body);
  return json(res, 200, { profile: publicProfile(user.uid, data), hubs: HUBS });
}

async function updateProfile(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const hub = body.cityId ? hubById(body.cityId) : null;
  const role = ALLOWED_ROLES.has(String(body.role || '')) ? String(body.role) : 'Artist';
  const ref = db().collection('sonaraSocialProfiles').doc(user.uid);
  await ensureProfile(user, body);
  await ref.set({
    displayName: cleanText(body.displayName || user.displayName || 'Creator SONARA', 80),
    photoURL: String(body.photoURL || user.photoUrl || '').slice(0, 1200),
    bio: cleanText(body.bio, 220),
    role,
    genres: cleanGenres(body.genres),
    languages: Array.isArray(body.languages) ? body.languages.map((v: unknown) => cleanText(v, 30)).filter(Boolean).slice(0, 6) : [],
    cityId: hub?.id || null,
    discoverable: Boolean(body.discoverable && hub),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return json(res, 200, { profile: publicProfile(user.uid, (await ref.get()).data() || {}) });
}

async function presence(user: AuthenticatedUser, res: any) {
  const ref = db().collection('sonaraSocialProfiles').doc(user.uid);
  await ensureProfile(user);
  await ref.set({ lastSeenAt: FieldValue.serverTimestamp(), onlineUntil: Timestamp.fromMillis(Date.now() + 90_000) }, { merge: true });
  return json(res, 200, { online: true });
}

async function discover(user: AuthenticatedUser, res: any) {
  await ensureProfile(user);
  const snapshot = await db().collection('sonaraSocialProfiles').where('discoverable', '==', true).limit(120).get();
  const profiles = snapshot.docs.map(doc => publicProfile(doc.id, doc.data())).filter(profile => profile.uid !== user.uid && profile.discoverable);
  return json(res, 200, { profiles, hubs: HUBS });
}

async function toggleFollow(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const targetUid = cleanText(body.targetUid, 128);
  if (!targetUid || targetUid === user.uid) return errorResponse(res, 400, 'INVALID_TARGET', 'Utente non valido.');
  const target = await db().collection('sonaraSocialProfiles').doc(targetUid).get();
  if (!target.exists || !target.data()?.discoverable) return errorResponse(res, 404, 'PROFILE_NOT_FOUND', 'Profilo non disponibile.');
  const followingRef = db().collection('sonaraSocialProfiles').doc(user.uid).collection('following').doc(targetUid);
  const followerRef = db().collection('sonaraSocialProfiles').doc(targetUid).collection('followers').doc(user.uid);
  const exists = (await followingRef.get()).exists;
  const batch = db().batch();
  if (exists) {
    batch.delete(followingRef);
    batch.delete(followerRef);
  } else {
    batch.set(followingRef, { createdAt: FieldValue.serverTimestamp() });
    batch.set(followerRef, { createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return json(res, 200, { following: !exists });
}

async function createThread(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const requested = Array.isArray(body.participantUids) ? body.participantUids.map((v: unknown) => cleanText(v, 128)).filter(Boolean) : [];
  const participantUids = Array.from(new Set([user.uid, ...requested])).slice(0, 12);
  if (participantUids.length < 2) return errorResponse(res, 400, 'THREAD_PARTICIPANTS_REQUIRED', 'Seleziona almeno un altro utente.');
  const isGroup = participantUids.length > 2;
  const sorted = [...participantUids].sort();
  const id = isGroup ? `group_${Date.now()}_${randomUUID().slice(0, 8)}` : `dm_${sorted.join('_')}`;
  const ref = db().collection('sonaraSocialThreads').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      participantUids,
      name: cleanText(body.name, 80) || null,
      isGroup,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: ''
    });
  }
  return json(res, 200, { threadId: id });
}

async function assertThreadMember(uid: string, threadId: string) {
  const ref = db().collection('sonaraSocialThreads').doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('THREAD_NOT_FOUND');
  const data = snap.data() || {};
  if (!Array.isArray(data.participantUids) || !data.participantUids.includes(uid)) throw new Error('THREAD_FORBIDDEN');
  return { ref, data };
}

async function listThreads(user: AuthenticatedUser, res: any) {
  const snapshot = await db().collection('sonaraSocialThreads').where('participantUids', 'array-contains', user.uid).limit(50).get();
  const profileCache = new Map<string, any>();
  const threads = await Promise.all(snapshot.docs.map(async doc => {
    const data = doc.data();
    const others = (Array.isArray(data.participantUids) ? data.participantUids : []).filter((uid: string) => uid !== user.uid);
    const participantProfiles = [];
    for (const uid of others.slice(0, 11)) {
      if (!profileCache.has(uid)) {
        const snap = await db().collection('sonaraSocialProfiles').doc(uid).get();
        profileCache.set(uid, snap.exists ? publicProfile(uid, snap.data() || {}) : { uid, displayName: 'Utente SONARA', photoURL: '' });
      }
      participantProfiles.push(profileCache.get(uid));
    }
    return {
      id: doc.id,
      name: cleanText(data.name, 80) || participantProfiles.map(p => p.displayName).join(', ') || 'Chat SONARA',
      isGroup: Boolean(data.isGroup),
      participantUids: data.participantUids || [],
      participants: participantProfiles,
      lastMessage: cleanText(data.lastMessage, 160),
      updatedAt: iso(data.updatedAt)
    };
  }));
  threads.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return json(res, 200, { threads });
}

async function listMessages(user: AuthenticatedUser, req: any, res: any) {
  const threadId = cleanText(req.query?.threadId, 256);
  await assertThreadMember(user.uid, threadId);
  const snapshot = await db().collection('sonaraSocialThreads').doc(threadId).collection('messages').orderBy('createdAt', 'asc').limit(200).get();
  const messages = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      senderUid: data.senderUid,
      text: cleanText(data.text, 2000),
      attachmentUrl: String(data.attachmentUrl || ''),
      attachmentType: String(data.attachmentType || ''),
      attachmentName: cleanText(data.attachmentName, 120),
      createdAt: iso(data.createdAt)
    };
  });
  return json(res, 200, { messages });
}

async function sendMessage(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const threadId = cleanText(body.threadId, 256);
  const { ref } = await assertThreadMember(user.uid, threadId);
  const text = cleanText(body.text, 2000);
  const attachmentUrl = String(body.attachmentUrl || '').slice(0, 2000);
  if (!text && !attachmentUrl) return errorResponse(res, 400, 'EMPTY_MESSAGE', 'Messaggio vuoto.');
  const messageRef = ref.collection('messages').doc();
  await messageRef.set({
    senderUid: user.uid,
    text,
    attachmentUrl,
    attachmentType: cleanText(body.attachmentType, 40),
    attachmentName: cleanText(body.attachmentName, 120),
    createdAt: FieldValue.serverTimestamp()
  });
  await ref.set({ lastMessage: text || cleanText(body.attachmentName, 120) || 'Allegato', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return json(res, 200, { sent: true, messageId: messageRef.id });
}

async function uploadAttachment(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const threadId = cleanText(body.threadId, 256);
  await assertThreadMember(user.uid, threadId);
  const mimeType = cleanText(body.mimeType, 100);
  if (!/^image\/(jpeg|png|webp|gif)$|^audio\/(mpeg|wav|x-wav|ogg|mp4|aac|webm)$/i.test(mimeType)) {
    return errorResponse(res, 415, 'ATTACHMENT_TYPE_NOT_ALLOWED', 'Sono consentiti immagini e file audio.');
  }
  const dataBase64 = String(body.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!dataBase64) return errorResponse(res, 400, 'ATTACHMENT_MISSING', 'File mancante.');
  const buffer = Buffer.from(dataBase64, 'base64');
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) return errorResponse(res, 413, 'ATTACHMENT_TOO_LARGE', 'Dimensione massima allegato: 6 MB.');
  const bucket = getStorage(getAdminApp()).bucket();
  const token = randomUUID();
  const safeName = cleanText(body.fileName, 100).replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const path = `social/${user.uid}/${threadId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const file = bucket.file(path);
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: { metadata: { firebaseStorageDownloadTokens: token }, cacheControl: 'private,max-age=3600' }
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
  return json(res, 200, { url, mimeType, fileName: safeName });
}

async function createCollaboration(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const title = cleanText(body.title, 120);
  if (!title) return errorResponse(res, 400, 'COLLAB_TITLE_REQUIRED', 'Inserisci cosa stai cercando.');
  const ref = db().collection('sonaraSocialCollaborations').doc();
  await ref.set({
    ownerUid: user.uid,
    title,
    description: cleanText(body.description, 700),
    genre: cleanText(body.genre, 60),
    roleWanted: cleanText(body.roleWanted, 60),
    language: cleanText(body.language, 40),
    bpm: Math.max(0, Math.min(300, Number(body.bpm || 0))),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return json(res, 200, { created: true, id: ref.id });
}

async function listCollaborations(user: AuthenticatedUser, res: any) {
  const snapshot = await db().collection('sonaraSocialCollaborations').where('status', '==', 'open').limit(80).get();
  const collaborations = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const profileSnap = await db().collection('sonaraSocialProfiles').doc(data.ownerUid).get();
    const owner = profileSnap.exists ? publicProfile(data.ownerUid, profileSnap.data() || {}) : null;
    if (!owner?.discoverable && data.ownerUid !== user.uid) continue;
    collaborations.push({
      id: doc.id,
      ownerUid: data.ownerUid,
      owner,
      title: cleanText(data.title, 120),
      description: cleanText(data.description, 700),
      genre: cleanText(data.genre, 60),
      roleWanted: cleanText(data.roleWanted, 60),
      language: cleanText(data.language, 40),
      bpm: Number(data.bpm || 0),
      createdAt: iso(data.createdAt)
    });
  }
  collaborations.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return json(res, 200, { collaborations });
}

function matchScore(me: any, candidate: any): number {
  let score = 35;
  const myGenres = new Set(cleanGenres(me.genres).map(v => v.toLowerCase()));
  const theirGenres = cleanGenres(candidate.genres).map(v => v.toLowerCase());
  const commonGenres = theirGenres.filter(v => myGenres.has(v)).length;
  score += Math.min(35, commonGenres * 15);
  if (me.cityId && candidate.cityId === me.cityId) score += 8;
  if (me.role && candidate.role && me.role !== candidate.role) score += 12;
  const myLanguages = new Set((me.languages || []).map((v: string) => String(v).toLowerCase()));
  if ((candidate.languages || []).some((v: string) => myLanguages.has(String(v).toLowerCase()))) score += 10;
  return Math.max(0, Math.min(100, score));
}

async function matches(user: AuthenticatedUser, res: any) {
  const meSnap = await db().collection('sonaraSocialProfiles').doc(user.uid).get();
  const me = meSnap.data() || await ensureProfile(user);
  const snapshot = await db().collection('sonaraSocialProfiles').where('discoverable', '==', true).limit(120).get();
  const matches = snapshot.docs
    .filter(doc => doc.id !== user.uid)
    .map(doc => ({ profile: publicProfile(doc.id, doc.data()), score: matchScore(me, doc.data()) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  return json(res, 200, { matches });
}

async function createRoom(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const name = cleanText(body.name, 90);
  const kind = ALLOWED_ROOM_KINDS.has(String(body.kind || '')) ? String(body.kind) : 'Studio aperto';
  if (!name) return errorResponse(res, 400, 'ROOM_NAME_REQUIRED', 'Inserisci un nome per la stanza.');
  const ref = db().collection('sonaraSocialRooms').doc();
  await ref.set({
    name,
    kind,
    genre: cleanText(body.genre, 50),
    ownerUid: user.uid,
    participantUids: [user.uid],
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return json(res, 200, { roomId: ref.id });
}

async function listRooms(res: any) {
  const snapshot = await db().collection('sonaraSocialRooms').where('active', '==', true).limit(50).get();
  const rooms = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: cleanText(data.name, 90),
      kind: cleanText(data.kind, 50),
      genre: cleanText(data.genre, 50),
      ownerUid: data.ownerUid,
      participantUids: Array.isArray(data.participantUids) ? data.participantUids : [],
      participantCount: Array.isArray(data.participantUids) ? data.participantUids.length : 0,
      updatedAt: iso(data.updatedAt)
    };
  });
  return json(res, 200, { rooms });
}

async function joinRoom(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const roomId = cleanText(body.roomId, 256);
  const ref = db().collection('sonaraSocialRooms').doc(roomId);
  const snap = await ref.get();
  if (!snap.exists || !snap.data()?.active) return errorResponse(res, 404, 'ROOM_NOT_FOUND', 'Stanza non disponibile.');
  await ref.set({ participantUids: FieldValue.arrayUnion(user.uid), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return json(res, 200, { joined: true });
}

async function roomMessages(user: AuthenticatedUser, req: any, res: any) {
  const roomId = cleanText(req.query?.roomId, 256);
  const room = await db().collection('sonaraSocialRooms').doc(roomId).get();
  if (!room.exists || !Array.isArray(room.data()?.participantUids) || !room.data()?.participantUids.includes(user.uid)) {
    return errorResponse(res, 403, 'ROOM_FORBIDDEN', 'Entra nella stanza prima di leggere i messaggi.');
  }
  const snapshot = await room.ref.collection('messages').orderBy('createdAt', 'asc').limit(150).get();
  return json(res, 200, { messages: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: iso(doc.data().createdAt) })) });
}

async function sendRoomMessage(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const roomId = cleanText(body.roomId, 256);
  const room = await db().collection('sonaraSocialRooms').doc(roomId).get();
  if (!room.exists || !Array.isArray(room.data()?.participantUids) || !room.data()?.participantUids.includes(user.uid)) {
    return errorResponse(res, 403, 'ROOM_FORBIDDEN', 'Entra nella stanza prima di scrivere.');
  }
  const text = cleanText(body.text, 1200);
  if (!text) return errorResponse(res, 400, 'EMPTY_MESSAGE', 'Messaggio vuoto.');
  await room.ref.collection('messages').add({ senderUid: user.uid, text, createdAt: FieldValue.serverTimestamp() });
  await room.ref.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return json(res, 200, { sent: true });
}

async function dashboard(user: AuthenticatedUser, res: any) {
  await ensureProfile(user);
  const [profilesSnap, collabsSnap, roomsSnap] = await Promise.all([
    db().collection('sonaraSocialProfiles').where('discoverable', '==', true).limit(120).get(),
    db().collection('sonaraSocialCollaborations').where('status', '==', 'open').limit(80).get(),
    db().collection('sonaraSocialRooms').where('active', '==', true).limit(50).get()
  ]);
  const profiles = profilesSnap.docs.map(doc => publicProfile(doc.id, doc.data())).filter(item => item.discoverable);
  const genreCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  for (const profile of profiles) {
    for (const genre of profile.genres) genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    if (profile.city) cityCounts.set(profile.city, (cityCounts.get(profile.city) || 0) + 1);
  }
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  return json(res, 200, {
    stats: {
      discoverableCreators: profiles.length,
      onlineCreators: profiles.filter(p => p.online).length,
      openCollaborations: collabsSnap.size,
      activeRooms: roomsSnap.size
    },
    topGenres,
    topCities
  });
}

async function blockUser(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const targetUid = cleanText(body.targetUid, 128);
  if (!targetUid || targetUid === user.uid) return errorResponse(res, 400, 'INVALID_TARGET', 'Utente non valido.');
  await db().collection('sonaraSocialProfiles').doc(user.uid).collection('blocked').doc(targetUid).set({ createdAt: FieldValue.serverTimestamp() });
  return json(res, 200, { blocked: true });
}

async function reportUser(user: AuthenticatedUser, body: Record<string, any>, res: any) {
  const targetUid = cleanText(body.targetUid, 128);
  const reason = cleanText(body.reason, 500);
  if (!targetUid || targetUid === user.uid || !reason) return errorResponse(res, 400, 'INVALID_REPORT', 'Segnalazione non valida.');
  const ref = db().collection('sonaraSocialReports').doc();
  await ref.set({ reporterUid: user.uid, targetUid, reason, status: 'open', createdAt: FieldValue.serverTimestamp() });
  return json(res, 200, { reported: true, id: ref.id });
}

export default async function handler(req: any, res: any) {
  const action = actionFromRequest(req);
  try {
    if (req.method === 'GET' && action === 'health') {
      return json(res, 200, {
        service: 'sonara-social-discovery',
        ready: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()),
        privacy: 'city-level-opt-in-only',
        demoProfiles: false
      });
    }

    const user = await authenticatedUser(req);
    if (!user) return errorResponse(res, 401, 'AUTH_TOKEN_INVALID', 'Accedi con un account SONARA valido.');

    if (req.method === 'POST' && action === 'bootstrap') return bootstrap(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'profile') return updateProfile(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'presence') return presence(user, res);
    if (req.method === 'GET' && action === 'discover') return discover(user, res);
    if (req.method === 'GET' && action === 'dashboard') return dashboard(user, res);
    if (req.method === 'POST' && action === 'follow') return toggleFollow(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'thread') return createThread(user, await readJsonBody(req), res);
    if (req.method === 'GET' && action === 'threads') return listThreads(user, res);
    if (req.method === 'GET' && action === 'messages') return listMessages(user, req, res);
    if (req.method === 'POST' && action === 'message') return sendMessage(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'attachment') return uploadAttachment(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'collaboration') return createCollaboration(user, await readJsonBody(req), res);
    if (req.method === 'GET' && action === 'collaborations') return listCollaborations(user, res);
    if (req.method === 'GET' && action === 'matches') return matches(user, res);
    if (req.method === 'POST' && action === 'room') return createRoom(user, await readJsonBody(req), res);
    if (req.method === 'GET' && action === 'rooms') return listRooms(res);
    if (req.method === 'POST' && action === 'room/join') return joinRoom(user, await readJsonBody(req), res);
    if (req.method === 'GET' && action === 'room/messages') return roomMessages(user, req, res);
    if (req.method === 'POST' && action === 'room/message') return sendRoomMessage(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'block') return blockUser(user, await readJsonBody(req), res);
    if (req.method === 'POST' && action === 'report') return reportUser(user, await readJsonBody(req), res);

    return errorResponse(res, 404, 'SOCIAL_ROUTE_NOT_FOUND', 'Rotta sociale SONARA non trovata.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVALID_JSON') return errorResponse(res, 400, 'INVALID_JSON', 'Corpo JSON non valido.');
    if (message === 'REQUEST_TOO_LARGE') return errorResponse(res, 413, 'REQUEST_TOO_LARGE', 'Richiesta troppo grande.');
    if (message === 'THREAD_NOT_FOUND') return errorResponse(res, 404, message, 'Conversazione non trovata.');
    if (message === 'THREAD_FORBIDDEN') return errorResponse(res, 403, message, 'Non fai parte di questa conversazione.');
    console.error('[SONARA SOCIAL]', message);
    return errorResponse(res, 500, 'SOCIAL_INTERNAL_ERROR', 'Il servizio sociale SONARA non è disponibile in questo momento.');
  }
}
