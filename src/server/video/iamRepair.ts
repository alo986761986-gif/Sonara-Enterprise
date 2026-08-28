import type { App } from 'firebase-admin/app';
import fs from 'node:fs';

async function googleJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  return { response, data };
}

async function resolvePrincipalEmail(token: string) {
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      const email = String(parsed?.client_email || '').trim();
      if (email) return { email, source: 'FIREBASE_SERVICE_ACCOUNT_JSON' };
    } catch {}
  }

  const credentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (credentialsPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const email = String(parsed?.client_email || '').trim();
      if (email) return { email, source: 'GOOGLE_APPLICATION_CREDENTIALS' };
    } catch {}
  }

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    });
    if (response.ok) {
      const info = await response.json() as any;
      const email = String(info?.email || '').trim();
      if (email) return { email, source: 'oauth-tokeninfo' };
    }
  } catch {}

  return { email: '', source: 'unresolved' };
}

export async function repairTranscoderIam(app: App) {
  const project = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || app.options.projectId || 'sonara-enterprise');
  const credential: any = app.options.credential;
  const access = await credential?.getAccessToken?.();
  const token = String(access?.access_token || access?.accessToken || '');
  if (!token) return { ok: false, stage: 'credential', project, error: 'Google access token unavailable from runtime credential.' };

  const principalInfo = await resolvePrincipalEmail(token);
  const principal = principalInfo.email;
  if (!principal) return { ok: false, stage: 'principal', project, principalSource: principalInfo.source, error: 'Runtime Google principal email could not be resolved.' };

  const getUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}:getIamPolicy`;
  const getResult = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
  if (!getResult.response.ok) return { ok: false, stage: 'getIamPolicy', project, principal, principalSource: principalInfo.source, google: getResult.data };

  const policy = getResult.data || {};
  const member = `serviceAccount:${principal}`;
  const role = 'roles/transcoder.editor';
  const bindings = Array.isArray(policy.bindings) ? policy.bindings : [];
  let binding = bindings.find((b: any) => b?.role === role);
  const alreadyGranted = Boolean(binding && Array.isArray(binding.members) && binding.members.includes(member));

  if (!alreadyGranted) {
    if (!binding) {
      binding = { role, members: [] };
      bindings.push(binding);
    }
    binding.members = Array.from(new Set([...(binding.members || []), member]));
    policy.bindings = bindings;
    const setUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}:setIamPolicy`;
    const setResult = await googleJson(setUrl, token, { method: 'POST', body: JSON.stringify({ policy, updateMask: 'bindings,etag' }) });
    if (!setResult.response.ok) return { ok: false, stage: 'setIamPolicy', project, principal, principalSource: principalInfo.source, google: setResult.data };
  }

  const verify = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
  const verified = Boolean(verify.response.ok && (verify.data?.bindings || []).some((b: any) => b?.role === role && Array.isArray(b.members) && b.members.includes(member)));
  return { ok: verified, stage: verified ? 'verified' : 'verify', project, principal, principalSource: principalInfo.source, role, alreadyGranted, verified };
}
