import fs from 'node:fs';

const serverPath = 'api/video/[...path].ts';
const clientPath = 'src/lib/firebaseClient.ts';

let server = fs.readFileSync(serverPath, 'utf8');
let client = fs.readFileSync(clientPath, 'utf8');

if (!server.includes("let storageCorsReady = false;")) {
  server = server.replace(
    "let adminApp: App | null = null;",
    `let adminApp: App | null = null;\nlet storageCorsReady = false;\nlet storageCorsPromise: Promise<void> | null = null;`
  );
}

if (!server.includes('async function ensureStorageCors')) {
  server = server.replace(
    "function serviceAccountConfigured() {",
    `async function ensureStorageCors(bucket: any) {\n  if (storageCorsReady) return;\n  if (!storageCorsPromise) {\n    storageCorsPromise = (async () => {\n      const setCorsConfiguration = bucket?.setCorsConfiguration;\n      if (typeof setCorsConfiguration !== 'function') throw new Error('STORAGE_CORS_UNSUPPORTED');\n      await setCorsConfiguration.call(bucket, [{\n        origin: [\n          'https://sonaraenterprise.com',\n          'https://www.sonaraenterprise.com',\n          'https://sonara-enterprise-git-main-sonaramusicai86-2765s-projects.vercel.app',\n          'http://localhost:3000',\n          'http://127.0.0.1:3000'\n        ],\n        method: ['GET', 'HEAD', 'PUT'],\n        responseHeader: ['Content-Type', 'ETag', 'x-goog-hash', 'x-goog-generation', 'x-goog-metageneration'],\n        maxAgeSeconds: 3600\n      }]);\n      storageCorsReady = true;\n      console.info('[SONARA VIDEO UPLOAD] storage CORS configured');\n    })().catch(cause => {\n      storageCorsPromise = null;\n      console.error('[SONARA VIDEO UPLOAD] storage CORS configuration failed', cause);\n      throw cause;\n    });\n  }\n  await storageCorsPromise;\n}\n\nfunction serviceAccountConfigured() {`
  );
}

server = server.replace(
  "    const bucket = getStorage(getAdminApp()).bucket(bucketName);\n    const file = bucket.file(storagePath);",
  "    const bucket = getStorage(getAdminApp()).bucket(bucketName);\n    await ensureStorageCors(bucket);\n    const file = bucket.file(storagePath);"
);

if (!client.includes('async function putSignedVideoAiUpload')) {
  client = client.replace(
    "function uploadErrorMessage(payload: any, fallback: string) {\n  const message = String(payload?.error?.message || payload?.message || '').trim();\n  return message || fallback;\n}",
    `function uploadErrorMessage(payload: any, fallback: string) {\n  const message = String(payload?.error?.message || payload?.message || '').trim();\n  return message || fallback;\n}\n\nasync function putSignedVideoAiUpload(uploadUrl: string, contentType: string, file: Blob) {\n  const send = () => fetch(uploadUrl, {\n    method: 'PUT',\n    headers: { 'Content-Type': contentType },\n    body: file\n  });\n\n  try {\n    return await send();\n  } catch (firstCause) {\n    console.warn('[SONARA VIDEO AI] signed upload network/CORS retry', firstCause);\n    await new Promise(resolve => setTimeout(resolve, 1200));\n    try {\n      return await send();\n    } catch (secondCause) {\n      console.error('[SONARA VIDEO AI] signed media upload unreachable', secondCause);\n      throw new Error('SONARA non riesce a raggiungere lo storage cloud. Riprova tra qualche secondo.');\n    }\n  }\n}`
  );
}

client = client.replace(
  "  const uploadResponse = await fetch(prepared.uploadUrl, {\n    method: 'PUT',\n    headers: { 'Content-Type': contentType },\n    body: file\n  });",
  "  const uploadResponse = await putSignedVideoAiUpload(prepared.uploadUrl, contentType, file);"
);

fs.writeFileSync(serverPath, server);
fs.writeFileSync(clientPath, client);
console.log('Patched Video AI signed upload CORS + retry.');
