import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import emberVoiceRouter from '../src/routes/emberVoice';

async function requestDisabledSpeech(port: number): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/ember/voice/speech',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode || 0, body }));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ text: 'Local disabled endpoint check' }));
  });
}

async function run(): Promise<void> {
  const originalVoiceEnabled = process.env.EMBER_VOICE_ENABLED;
  const originalAuthRequired = process.env.SONARA_REQUIRE_AUTH;
  const originalFetch = globalThis.fetch;
  process.env.EMBER_VOICE_ENABLED = 'false';
  process.env.SONARA_REQUIRE_AUTH = 'false';
  globalThis.fetch = (async () => {
    throw new Error('Provider fetch must not be called while Ember Voice is disabled.');
  }) as typeof fetch;

  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.sonaraUser = { sub: 'local-disabled-check' };
    next();
  });
  app.use('/api/ember/voice', emberVoiceRouter);

  const server = await new Promise<http.Server>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const response = await requestDisabledSpeech(address.port);
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(response.body).error.code, 'EMBER_VOICE_DISABLED');
    console.log('Disabled endpoint check passed: HTTP 503 EMBER_VOICE_DISABLED');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = originalFetch;
    if (originalVoiceEnabled === undefined) delete process.env.EMBER_VOICE_ENABLED;
    else process.env.EMBER_VOICE_ENABLED = originalVoiceEnabled;
    if (originalAuthRequired === undefined) delete process.env.SONARA_REQUIRE_AUTH;
    else process.env.SONARA_REQUIRE_AUTH = originalAuthRequired;
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});