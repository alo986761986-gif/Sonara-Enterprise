// Read-only gateway readiness shared by the existing billing/job function.
// It does not create a new Vercel function or submit/claim any audio job.
// Public output contains booleans/status only; no credentials or upstream bodies.
let cached: { until: number; status: number; body: Record<string, unknown> } | null = null;
export async function relayReadiness(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (cached && cached.until > Date.now()) return res.status(cached.status).json(cached.body);
  const send = (status: number, body: Record<string, unknown>) => {
    cached = { until: Date.now() + 15000, status, body };
    return res.status(status).json(body);
  };
  const secret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (!secret) return send(503, { service: 'sonara-relay-readiness', gatewayAuthenticated: false, reason: 'GATEWAY_KEY_MISSING' });
  try {
    const response = await fetch('https://api.sonaraenterprise.com/api/sonara-relay/gateway-auth', {
      method: 'GET',
      redirect: 'manual',
      headers: { 'X-Sonara-Internal-Secret': secret, Accept: 'application/json', 'User-Agent': 'SONARA-Vercel-Gateway/1' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return send(503, { service: 'sonara-relay-readiness', gatewayAuthenticated: false, upstreamStatus: response.status });
    const data = await response.json();
    const authenticated = data?.service === 'sonara-gateway' && data?.authenticated === true;
    return send(authenticated ? 200 : 503, {
      service: 'sonara-relay-readiness',
      gatewayAuthenticated: authenticated,
      storageConfigured: data?.storageConfigured === true,
      relayEnabled: data?.relayEnabled === true,
      agentOnline: data?.agentOnline === true,
      agentRevision: String(data?.agentRevision || ''),
      agentAgeMs: Number.isFinite(Number(data?.agentAgeMs)) ? Number(data.agentAgeMs) : null,
      musicReadinessVerified: data?.agentOnline === true,
    });
  } catch {
    return send(503, { service: 'sonara-relay-readiness', gatewayAuthenticated: false, reason: 'GATEWAY_UNREACHABLE' });
  }
}
