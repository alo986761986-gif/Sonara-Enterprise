const STATE_KEY = 'state';
const TTL_MS = 6 * 60 * 60 * 1000;

export class SonaraJobState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'PUT') {
      const state = await request.json();
      await this.ctx.storage.put(STATE_KEY, state);
      await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
      return new Response(null, { status: 204 });
    }

    if (request.method === 'GET') {
      const state = await this.ctx.storage.get(STATE_KEY);
      if (!state) return new Response(null, { status: 404 });
      return Response.json(state, { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'DELETE') {
      await this.ctx.storage.deleteAll();
      return new Response(null, { status: 204 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
