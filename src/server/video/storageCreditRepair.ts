import type { App } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

async function googleJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(15_000)
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1200) }; }
  return { response, data };
}

async function accessToken(app: App) {
  const token = await app.options.credential?.getAccessToken();
  if (!token?.access_token) throw new Error('Google access token unavailable.');
  return token.access_token;
}

export async function repairStorageAndGrantStudioCredits(app: App, bucketName: string, jobId: string) {
  const projectId = String(
    process.env.SONARA_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    app.options.projectId ||
    'sonara-enterprise'
  ).trim();
  const token = await accessToken(app);

  const storage: Record<string, unknown> = {
    ok: false,
    projectId,
    bucketName
  };

  try {
    const projectResult = await googleJson(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`,
      token,
      { method: 'GET' }
    );
    if (!projectResult.response.ok) {
      Object.assign(storage, { stage: 'project', status: projectResult.response.status, google: projectResult.data });
    } else {
      const projectNumber = String(projectResult.data?.projectNumber || '').trim();
      const serviceAgent = projectNumber ? `service-${projectNumber}@gcp-sa-transcoder.iam.gserviceaccount.com` : '';
      Object.assign(storage, { projectNumber, serviceAgent });

      const bucketResult = await googleJson(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}?fields=name,projectNumber,location`,
        token,
        { method: 'GET' }
      );
      if (!bucketResult.response.ok) {
        Object.assign(storage, { stage: 'bucket', status: bucketResult.response.status, google: bucketResult.data });
      } else if (!serviceAgent) {
        Object.assign(storage, { stage: 'service-agent', status: 500, error: 'Transcoder service agent could not be derived.' });
      } else {
        Object.assign(storage, {
          bucketProjectNumber: String(bucketResult.data?.projectNumber || ''),
          bucketLocation: String(bucketResult.data?.location || '')
        });
        const policyUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/iam`;
        const policyResult = await googleJson(policyUrl, token, { method: 'GET' });
        if (!policyResult.response.ok) {
          Object.assign(storage, { stage: 'getBucketIamPolicy', status: policyResult.response.status, google: policyResult.data });
        } else {
          const policy = policyResult.data || {};
          const bindings = Array.isArray(policy.bindings) ? policy.bindings : [];
          const role = 'roles/storage.objectAdmin';
          const member = `serviceAccount:${serviceAgent}`;
          let binding = bindings.find((item: any) => item?.role === role);
          const alreadyGranted = Boolean(binding && Array.isArray(binding.members) && binding.members.includes(member));
          if (!alreadyGranted) {
            if (!binding) {
              binding = { role, members: [] };
              bindings.push(binding);
            }
            binding.members = Array.from(new Set([...(binding.members || []), member]));
            policy.bindings = bindings;
            const setResult = await googleJson(policyUrl, token, {
              method: 'PUT',
              body: JSON.stringify(policy)
            });
            if (!setResult.response.ok) {
              Object.assign(storage, { stage: 'setBucketIamPolicy', status: setResult.response.status, alreadyGranted: false, google: setResult.data });
            } else {
              Object.assign(storage, { ok: true, stage: 'verified', status: setResult.response.status, alreadyGranted: false, role });
            }
          } else {
            Object.assign(storage, { ok: true, stage: 'verified', status: 200, alreadyGranted: true, role });
          }
        }
      }
    }
  } catch (error) {
    Object.assign(storage, { stage: 'runtime', error: error instanceof Error ? error.message : String(error) });
  }

  const credits: Record<string, unknown> = { ok: false, jobId };
  try {
    const firestore = getFirestore(app);
    const jobSnapshot = await firestore.collection('sonaraVideoJobs').doc(jobId).get();
    if (!jobSnapshot.exists) {
      Object.assign(credits, { stage: 'job', error: 'Video job not found.' });
    } else {
      const uid = String(jobSnapshot.data()?.uid || '').trim();
      if (!uid) {
        Object.assign(credits, { stage: 'uid', error: 'Video job has no uid.' });
      } else {
        const billingRef = firestore.collection('sonaraBilling').doc(uid);
        const billingSnapshot = await billingRef.get();
        const billing = billingSnapshot.exists ? billingSnapshot.data() as any : {};
        if (billing?.planId !== 'studio') {
          Object.assign(credits, { stage: 'plan', planId: billing?.planId || 'unknown', error: 'Target account is not SONARA Studio.' });
        } else {
          const existingOverride = Math.max(0, Number(billing?.videoCreditsPerMonthOverride || 0));
          const targetAllowance = Math.max(existingOverride, 10060);
          await billingRef.set({
            videoCreditsPerMonthOverride: targetAllowance,
            videoCreditsOverrideReason: 'SONARA Studio owner bonus +10000 Video AI credits',
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          Object.assign(credits, {
            ok: true,
            stage: 'granted',
            planId: 'studio',
            previousOverride: existingOverride,
            videoCreditsPerMonthOverride: targetAllowance,
            addedVideoCredits: 10000
          });
        }
      }
    }
  } catch (error) {
    Object.assign(credits, { stage: 'runtime', error: error instanceof Error ? error.message : String(error) });
  }

  return { storage, credits };
}
