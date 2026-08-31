const fs = require('node:fs');
const { cert, getApps, initializeApp } = require('firebase-admin/app');

const OUTPUT = '/tmp/sonara-firebase-web-key.txt';
const REQUIRED_REFERRERS = [
  'https://sonaraenterprise.com/*',
  'https://*.sonaraenterprise.com/*',
  'https://sonaraenterprice.com/*',
  'https://*.sonaraenterprice.com/*',
  'https://sonara-enterprise.vercel.app/*',
  'https://*.vercel.app/*'
];

async function json(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

async function request(url, options, label) {
  const response = await fetch(url, options);
  const body = await json(response);
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status}): ${JSON.stringify(body).slice(0, 700)}`);
  }
  return body;
}

async function main() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is unavailable in the Vercel production build.');

  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.'); }
  const projectId = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id || '').trim();
  if (!projectId || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Firebase service-account data is incomplete.');
  }

  const appName = 'sonara-web-key-rotation';
  const existing = getApps().find((candidate) => candidate.name === appName);
  const app = existing || initializeApp({ credential: cert(serviceAccount), projectId }, appName);
  const access = await app.options.credential.getAccessToken();
  const token = String(access?.access_token || '').trim();
  if (!token) throw new Error('Unable to obtain Google OAuth access token.');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const parent = `projects/${projectId}/locations/global`;
  const create = await request(
    `https://apikeys.googleapis.com/v2/${parent}/keys`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        displayName: `sonara-web-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        restrictions: {
          browserKeyRestrictions: { allowedReferrers: REQUIRED_REFERRERS },
          apiTargets: [
            { service: 'identitytoolkit.googleapis.com' },
            { service: 'securetoken.googleapis.com' }
          ]
        }
      })
    },
    'API key creation'
  );

  let operation = create;
  for (let attempt = 0; attempt < 30 && !operation.done; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    operation = await request(`https://apikeys.googleapis.com/v2/${operation.name}`, { headers }, 'API key operation');
  }
  if (!operation.done) throw new Error('Google API key creation did not finish in time.');
  if (operation.error) throw new Error(`Google API key creation failed: ${JSON.stringify(operation.error).slice(0, 700)}`);

  const keyName = String(operation.response?.name || '').trim();
  if (!keyName) throw new Error('Google API Keys API returned no key resource name.');
  const keyData = await request(`https://apikeys.googleapis.com/v2/${keyName}/keyString`, { headers }, 'API key retrieval');
  const keyString = String(keyData.keyString || '').trim();
  if (!keyString) throw new Error('Google API Keys API returned an empty key string.');

  const probe = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(keyString)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sonara-key-probe@example.invalid', password: 'not-a-real-password', returnSecureToken: true })
  });
  const probeBody = await json(probe);
  const probeText = JSON.stringify(probeBody);
  if (/API_KEY_INVALID|CONSUMER_SUSPENDED|PERMISSION_DENIED|suspend/i.test(probeText)) {
    throw new Error(`Replacement Firebase key was rejected: ${probeText.slice(0, 500)}`);
  }

  fs.writeFileSync(OUTPUT, keyString, { mode: 0o600 });
  console.log('[SONARA][Firebase] Replacement web API key created and accepted by Firebase Auth.');
  console.log('[SONARA][Firebase] Key value intentionally omitted from logs.');
}

main().catch((error) => {
  console.error(`[SONARA][Firebase] WEB_KEY_ROTATION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
