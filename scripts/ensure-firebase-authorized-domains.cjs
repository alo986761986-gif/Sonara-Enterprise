const { cert, getApps, initializeApp } = require('firebase-admin/app');

const REQUIRED_DOMAINS = [
  'sonaraenterprise.com',
  'www.sonaraenterprise.com',
  'sonaraenterprice.com',
  'sonara-enterprise.vercel.app',
  'sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app',
  'sonara-enterprise-git-main-sonaramusicai86-2765s-projects.vercel.app'
];

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Identity Toolkit returned invalid JSON (HTTP ${response.status}).`);
  }
}

async function main() {
  const rawServiceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawServiceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured in the Vercel production environment.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount.project_id ||
    ''
  ).trim();

  if (!projectId) throw new Error('Firebase project ID is missing.');

  const appName = 'sonara-authorized-domain-repair';
  const existing = getApps().find((candidate) => candidate.name === appName);
  const app = existing || initializeApp({
    credential: cert(serviceAccount),
    projectId
  }, appName);

  const access = await app.options.credential.getAccessToken();
  const accessToken = String(access?.access_token || '').trim();
  if (!accessToken) throw new Error('Unable to obtain a Firebase Admin OAuth access token.');

  const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  const currentResponse = await fetch(configUrl, { headers });
  const current = await readJson(currentResponse);
  if (!currentResponse.ok) {
    throw new Error(`Unable to read Firebase Auth config (HTTP ${currentResponse.status}): ${JSON.stringify(current).slice(0, 600)}`);
  }

  const existingDomains = Array.isArray(current.authorizedDomains)
    ? current.authorizedDomains.map((domain) => String(domain).trim()).filter(Boolean)
    : [];
  const mergedDomains = [...new Set([...existingDomains, ...REQUIRED_DOMAINS])];
  const missingBefore = REQUIRED_DOMAINS.filter((domain) => !existingDomains.includes(domain));

  if (missingBefore.length === 0) {
    console.log(`[SONARA][Firebase] Authorized domains already valid for ${projectId}.`);
    console.log(`[SONARA][Firebase] Required domains: ${REQUIRED_DOMAINS.join(', ')}`);
    return;
  }

  const updateResponse = await fetch(`${configUrl}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: current.name || `projects/${projectId}/config`,
      authorizedDomains: mergedDomains
    })
  });
  const updated = await readJson(updateResponse);
  if (!updateResponse.ok) {
    throw new Error(`Unable to update Firebase authorized domains (HTTP ${updateResponse.status}): ${JSON.stringify(updated).slice(0, 600)}`);
  }

  const updatedDomains = Array.isArray(updated.authorizedDomains)
    ? updated.authorizedDomains.map((domain) => String(domain).trim()).filter(Boolean)
    : [];
  const missingAfter = REQUIRED_DOMAINS.filter((domain) => !updatedDomains.includes(domain));
  if (missingAfter.length) {
    throw new Error(`Firebase Auth update did not retain required domains: ${missingAfter.join(', ')}`);
  }

  console.log(`[SONARA][Firebase] Authorized-domain repair applied to ${projectId}.`);
  console.log(`[SONARA][Firebase] Added/confirmed: ${REQUIRED_DOMAINS.join(', ')}`);
}

main().catch((error) => {
  console.error(`[SONARA][Firebase] AUTHORIZED_DOMAIN_REPAIR_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
