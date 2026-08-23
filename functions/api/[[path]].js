export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    return response;
  }

  const body = await response.text();
  const preview = body.trim().replace(/\s+/g, ' ').slice(0, 180);
  const status = response.ok ? 502 : response.status || 502;

  return new Response(
    JSON.stringify({
      error: `Sonara production API returned a non-JSON response (HTTP ${status}).`,
      message: preview || 'The production API returned an empty response.'
    }),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': 'no-store'
      }
    }
  );
}
