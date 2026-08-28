import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';

function getAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const projectId = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'sonara-enterprise').trim();
  return initializeApp({
    projectId,
    credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
  });
}

async function googleJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  return { response, data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const app = getAdminApp();
    const project = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || app.options.projectId || 'sonara-enterprise');
    const credential: any = app.options.credential;
    const access = await credential?.getAccessToken?.();
    const token = String(access?.access_token || access?.accessToken || '');
    if (!token) throw new Error('Google access token unavailable from runtime credential.');

    const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
    const parsed = serviceAccountJson ? JSON.parse(serviceAccountJson) : {};
    const principal = String(parsed.client_email || 'runtime-application-default');

    const getUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}:getIamPolicy`;
    const getResult = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
    if (!getResult.response.ok) {
      return res.status(getResult.response.status).json({ ok: false, stage: 'getIamPolicy', project, principalKind: principal === 'runtime-application-default' ? 'adc' : 'service-account', google: getResult.data });
    }

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
      if (!setResult.response.ok) {
        return res.status(setResult.response.status).json({ ok: false, stage: 'setIamPolicy', project, alreadyGranted: false, google: setResult.data });
      }
    }

    const verify = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
    const verified = Boolean(verify.response.ok && (verify.data?.bindings || []).some((b: any) => b?.role === role && Array.isArray(b.members) && b.members.includes(member)));

    return res.status(verified ? 200 : 500).json({
      ok: verified,
      project,
      role,
      alreadyGranted,
      verified,
      message: verified ? 'Transcoder Editor granted to SONARA runtime service account.' : 'IAM binding not verified.'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, stage: 'runtime', error: error instanceof Error ? error.message : String(error) });
  }
}
