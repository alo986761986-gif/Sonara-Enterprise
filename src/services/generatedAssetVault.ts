export type GeneratedAssetKind = 'audio' | 'image' | 'metadata' | 'file';

export interface StoredGeneratedAsset {
  id: string;
  name: string;
  label: string;
  kind: GeneratedAssetKind;
  format: string;
  mimeType: string;
  bytes: number;
  remoteUrl?: string;
  blob?: Blob;
  storedOffline: boolean;
  createdAt: string;
}

export interface GeneratedProjectArchive {
  id: string;
  jobId: string;
  title: string;
  genre: string;
  subgenre: string;
  bpm: number;
  keySignature: string;
  durationSec: number;
  createdAt: string;
  updatedAt: string;
  assets: StoredGeneratedAsset[];
}

export interface ArchiveGenerationInput {
  jobId: string;
  title: string;
  genre: string;
  subgenre: string;
  bpm: number;
  keySignature: string;
  durationSec: number;
  primaryAudioUrl?: string;
  audioFormat?: string;
  response: unknown;
}

export interface ArchiveGenerationResult {
  project: GeneratedProjectArchive;
  storedFiles: number;
  linkedFiles: number;
}

const DATABASE_NAME = 'sonara-generated-assets';
const DATABASE_VERSION = 1;
const PROJECT_STORE = 'projects';
const FALLBACK_KEY = 'sonara.generatedProjects';
const ASSET_EVENT = 'sonara:asset-vault-updated';

interface AssetCandidate {
  url: string;
  label: string;
  formatHint?: string;
}

function safeName(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return normalized || fallback;
}

function uniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open the SONARA archive.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('SONARA archive operation failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('SONARA archive transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('SONARA archive transaction was aborted.'));
  });
}

function withoutBlobs(project: GeneratedProjectArchive): GeneratedProjectArchive {
  return {
    ...project,
    assets: project.assets.map(asset => ({ ...asset, blob: undefined, storedOffline: false }))
  };
}

function readFallbackProjects(): GeneratedProjectArchive[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeFallbackProjects(projects: GeneratedProjectArchive[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(projects.map(withoutBlobs).slice(0, 100)));
  } catch {
    // IndexedDB remains the primary archive when localStorage is full or unavailable.
  }
}

async function readProject(id: string): Promise<GeneratedProjectArchive | undefined> {
  try {
    const database = await openVault();
    const transaction = database.transaction(PROJECT_STORE, 'readonly');
    const project = await requestResult(transaction.objectStore(PROJECT_STORE).get(id));
    database.close();
    return (project as GeneratedProjectArchive | undefined) || readFallbackProjects().find(item => item.id === id);
  } catch {
    return readFallbackProjects().find(project => project.id === id);
  }
}

async function writeProject(project: GeneratedProjectArchive): Promise<boolean> {
  try {
    const database = await openVault();
    const transaction = database.transaction(PROJECT_STORE, 'readwrite');
    transaction.objectStore(PROJECT_STORE).put(project);
    await transactionDone(transaction);
    database.close();
  } catch (error) {
    const fallback = readFallbackProjects().filter(item => item.id !== project.id);
    writeFallbackProjects([withoutBlobs(project), ...fallback]);
    return false;
  }

  const fallback = readFallbackProjects().filter(item => item.id !== project.id);
  writeFallbackProjects([withoutBlobs(project), ...fallback]);
  return true;
}

function looksLikeFileUrl(value: string, path: string): boolean {
  const isUrl = /^(https?:\/\/|\/)/i.test(value);
  if (!isUrl) return false;
  const pathSuggestsAsset = /(audio|file|stem|master|mix|cover|artwork|image|download|waveform|url)/i.test(path);
  const valueHasExtension = /\.(wav|mp3|flac|m4a|aac|ogg|webm|mp4|png|jpe?g|webp|json|zip)(?:[?#]|$)/i.test(value);
  return pathSuggestsAsset || valueHasExtension;
}

function collectAssetCandidates(value: unknown, path = 'result', depth = 0, output = new Map<string, AssetCandidate>()): Map<string, AssetCandidate> {
  if (depth > 8 || value == null) return output;

  if (typeof value === 'string') {
    if (looksLikeFileUrl(value, path) && !output.has(value)) {
      const label = path.split('.').filter(Boolean).pop()?.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Generated file';
      output.set(value, { url: value, label });
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAssetCandidates(item, `${path}.${index + 1}`, depth + 1, output));
    return output;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      collectAssetCandidates(item, `${path}.${key}`, depth + 1, output);
    });
  }

  return output;
}

function extensionFromUrl(url: string, fallback = 'bin'): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function extensionFromMime(mimeType: string): string | undefined {
  const types: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/json': 'json',
    'application/zip': 'zip'
  };
  return types[mimeType.split(';')[0].trim().toLowerCase()];
}

function kindFromMime(format: string, mimeType: string): GeneratedAssetKind {
  if (mimeType.startsWith('audio/') || /^(wav|mp3|flac|m4a|aac|ogg)$/i.test(format)) return 'audio';
  if (mimeType.startsWith('image/') || /^(png|jpe?g|webp)$/i.test(format)) return 'image';
  if (mimeType.includes('json') || format === 'json') return 'metadata';
  return 'file';
}

async function materializeAsset(candidate: AssetCandidate, projectId: string, index: number, title: string): Promise<StoredGeneratedAsset> {
  let blob: Blob | undefined;
  let mimeType = '';
  let storedOffline = false;

  try {
    const response = await fetch(candidate.url, { cache: 'no-store' });
    if (response.ok) {
      blob = await response.blob();
      mimeType = blob.type || response.headers.get('content-type') || '';
      storedOffline = blob.size > 0;
    }
  } catch {
    // Keep the remote reference if the source does not allow browser-side copying.
  }

  const format = extensionFromMime(mimeType) || extensionFromUrl(candidate.url, candidate.formatHint || 'bin');
  const label = candidate.label.replace(/^\d+\s*/, '').trim() || `Generated file ${index + 1}`;
  const name = `${safeName(title, 'sonara-track')}-${safeName(label, `file-${index + 1}`)}.${format}`.toLowerCase();

  return {
    id: `${projectId}-asset-${index}-${safeName(label, 'file').toLowerCase()}`,
    name,
    label,
    kind: kindFromMime(format, mimeType),
    format,
    mimeType: mimeType || 'application/octet-stream',
    bytes: blob?.size || 0,
    remoteUrl: candidate.url,
    blob,
    storedOffline,
    createdAt: new Date().toISOString()
  };
}

function mergeAssets(existing: StoredGeneratedAsset[], incoming: StoredGeneratedAsset[]): StoredGeneratedAsset[] {
  const merged = new Map<string, StoredGeneratedAsset>();
  existing.forEach(asset => merged.set(asset.remoteUrl || asset.id, asset));
  incoming.forEach(asset => {
    const key = asset.remoteUrl || asset.id;
    const previous = merged.get(key);
    merged.set(key, asset.storedOffline || !previous?.storedOffline ? asset : previous);
  });
  return [...merged.values()];
}

export async function archiveGeneratedProject(input: ArchiveGenerationInput): Promise<ArchiveGenerationResult> {
  const now = new Date().toISOString();
  const projectId = `job-${safeName(input.jobId, uniqueId('generation')).toLowerCase()}`;
  const candidateMap = collectAssetCandidates(input.response);

  if (input.primaryAudioUrl) {
    candidateMap.set(input.primaryAudioUrl, {
      url: input.primaryAudioUrl,
      label: 'Master audio',
      formatHint: input.audioFormat || 'wav'
    });
  }

  const candidates = [...candidateMap.values()];
  const materialized = await Promise.all(
    candidates.map((candidate, index) => materializeAsset(candidate, projectId, index, input.title))
  );

  const sessionPayload = {
    jobId: input.jobId,
    title: input.title,
    genre: input.genre,
    subgenre: input.subgenre,
    bpm: input.bpm,
    keySignature: input.keySignature,
    durationSec: input.durationSec,
    archivedAt: now,
    generation: input.response
  };
  const sessionBlob = new Blob([JSON.stringify(sessionPayload, null, 2)], { type: 'application/json' });
  materialized.push({
    id: `${projectId}-session`,
    name: `${safeName(input.title, 'sonara-track').toLowerCase()}-session.json`,
    label: 'Session metadata',
    kind: 'metadata',
    format: 'json',
    mimeType: 'application/json',
    bytes: sessionBlob.size,
    blob: sessionBlob,
    storedOffline: true,
    createdAt: now
  });

  const previous = await readProject(projectId);
  const project: GeneratedProjectArchive = {
    id: projectId,
    jobId: input.jobId,
    title: input.title || previous?.title || 'SONARA Track',
    genre: input.genre || previous?.genre || 'Music',
    subgenre: input.subgenre || previous?.subgenre || input.genre || 'Music',
    bpm: input.bpm || previous?.bpm || 124,
    keySignature: input.keySignature || previous?.keySignature || 'A Minor',
    durationSec: input.durationSec || previous?.durationSec || 30,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    assets: mergeAssets(previous?.assets || [], materialized)
  };

  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => false);
  }

  const filesPersisted = await writeProject(project);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ASSET_EVENT));

  return {
    project,
    storedFiles: filesPersisted ? project.assets.filter(asset => asset.storedOffline).length : 0,
    linkedFiles: filesPersisted ? project.assets.filter(asset => !asset.storedOffline).length : project.assets.length
  };
}

export async function listGeneratedProjects(): Promise<GeneratedProjectArchive[]> {
  try {
    const database = await openVault();
    const transaction = database.transaction(PROJECT_STORE, 'readonly');
    const projects = await requestResult(transaction.objectStore(PROJECT_STORE).getAll()) as GeneratedProjectArchive[];
    database.close();
    const merged = new Map<string, GeneratedProjectArchive>();
    readFallbackProjects().forEach(project => merged.set(project.id, project));
    projects.forEach(project => merged.set(project.id, project));
    return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return readFallbackProjects().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export async function clearGeneratedProjects(): Promise<void> {
  try {
    const database = await openVault();
    const transaction = database.transaction(PROJECT_STORE, 'readwrite');
    transaction.objectStore(PROJECT_STORE).clear();
    await transactionDone(transaction);
    database.close();
  } catch {
    // localStorage cleanup below still removes the fallback archive.
  } finally {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(ASSET_EVENT));
  }
}

export function downloadStoredAsset(asset: StoredGeneratedAsset): void {
  const href = asset.blob ? URL.createObjectURL(asset.blob) : asset.remoteUrl;
  if (!href || typeof document === 'undefined') return;

  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = asset.name;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (asset.blob) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const GENERATED_ASSET_EVENT = ASSET_EVENT;
