// Read-only server-to-server authentication readiness. No job submission.
// Public output contains booleans/status only, never credentials or upstream bodies.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const secret = String(process.env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (!secret) return res.status(503).json({ service: 'sonara-relay-readiness', gatewayAuthenticated: false, reason: 'GATEWAY_KEY_MISSING' });
  try {
    const response = await fetch('https://api.sonaraenterprise.com/api/sonara-relay/gateway-auth', {
      method: 'GET',
      redirect: 'manual',
      headers: { 'X-Sonara-Internal-Secret': secret, Accept: 'application/json', 'User-Agent': 'SONARA-Vercel-Gateway/1' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return res.status(503).json({ service: 'sonara-relay-readiness', gatewayAuthenticated: false, upstreamStatus: response.status });
    const data = await response.json();
    const authenticated = data?.service === 'sonara-gateway' && data?.authenticated === true;
    return res.status(authenticated ? 200 : 503).json({
      service: 'sonara-relay-readiness',
      gatewayAuthenticated: authenticated,
      storageConfigured: data?.storageConfigured === true,
      relayEnabled: data?.relayEnabled === true,
      musicReadinessVerified: false,
    });
  } catch {
    return res.status(503).json({ service: 'sonara-relay-readiness', gatewayAuthenticated: false, reason: 'GATEWAY_UNREACHABLE' });
  }
}
