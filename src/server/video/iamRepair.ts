import type { App } from 'firebase-admin/app';

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

export async function repairTranscoderIam(app: App) {
  const project = String(process.env.SONARA_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || app.options.projectId || 'sonara-enterprise');
  const credential: any = app.options.credential;
  const access = await credential?.getAccessToken?.();
  const token = String(access?.access_token || access?.accessToken || '');
  if (!token) return { ok: false, stage: 'credential', project, error: 'Google access token unavailable from runtime credential.' };

  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const parsed = serviceAccountJson ? JSON.parse(serviceAccountJson) : {};
  const principal = String(parsed.client_email || '').trim();
  if (!principal) return { ok: false, stage: 'principal', project, error: 'Runtime credential principal email is unavailable.' };

  const getUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(project)}:getIamPolicy`;
  const getResult = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
  if (!getResult.response.ok) return { ok: false, stage: 'getIamPolicy', project, google: getResult.data };

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
    if (!setResult.response.ok) return { ok: false, stage: 'setIamPolicy', project, google: setResult.data };
  }

  const verify = await googleJson(getUrl, token, { method: 'POST', body: JSON.stringify({ options: { requestedPolicyVersion: 3 } }) });
  const verified = Boolean(verify.response.ok && (verify.data?.bindings || []).some((b: any) => b?.role === role && Array.isArray(b.members) && b.members.includes(member)));
  return { ok: verified, stage: verified ? 'verified' : 'verify', project, role, alreadyGranted, verified };
}
