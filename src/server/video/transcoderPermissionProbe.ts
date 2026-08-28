import type { App } from 'firebase-admin/app';

export async function probeTranscoderCreatePermission(app: App) {
  const project = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    app.options.projectId ||
    'sonara-enterprise'
  ).trim();
  const credential: any = app.options.credential;
  const access = await credential?.getAccessToken?.();
  const token = String(access?.access_token || access?.accessToken || '');
  if (!token) return { ok: false, permissionGranted: false, status: 0, error: 'Google access token unavailable.' };

  const jobId = `sonara-permission-probe-${Date.now()}`;
  const url = `https://transcoder.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/us-central1/jobs?jobId=${encodeURIComponent(jobId)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  let google: any = {};
  try { google = text ? JSON.parse(text) : {}; } catch { google = { raw: text.slice(0, 1000) }; }

  const permissionDenied = response.status === 403 && /transcoder\.jobs\.create|permission/i.test(JSON.stringify(google));
  const permissionGranted = !permissionDenied && response.status !== 401;
  return {
    ok: permissionGranted,
    permissionGranted,
    status: response.status,
    expectedValidationFailure: permissionGranted && response.status >= 400,
    project,
    google
  };
}
