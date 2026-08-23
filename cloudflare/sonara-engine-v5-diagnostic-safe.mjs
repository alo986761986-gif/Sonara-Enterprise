import diagnosticV5 from './sonara-engine-v5-diagnostic.mjs';

function json(data, status = 500) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'Access-Control-Allow-Origin': 'https://sonaraenterprise.com'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await diagnosticV5.fetch(request, env, ctx);
    } catch (error) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/diagnostic/')) {
        return json({
          status: 'FAILED',
          stage: 'uncaught',
          name: error instanceof Error ? error.name : '',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }
};
