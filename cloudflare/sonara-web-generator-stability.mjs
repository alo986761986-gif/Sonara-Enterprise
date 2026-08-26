import sonaraProxy from './sonara-web-dj-proxy.mjs';

const BLOCKED_GENERATOR_EDGE_SCRIPTS = [
  'sonara-intelligent-lyrics-edge.js',
  'sonara-vocal-character-edge.js',
  'sonara-vocal-character-visible.js'
];

function stripDuplicateGeneratorScripts(html) {
  return BLOCKED_GENERATOR_EDGE_SCRIPTS.reduce((output, scriptName) => {
    const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${escaped}[^"']*["'][^>]*>\\s*<\\/script>`, 'gi');
    return output.replace(pattern, '');
  }, html);
}

export default {
  async fetch(request, env, ctx) {
    const response = await sonaraProxy.fetch(request, env, ctx);
    const contentType = response.headers.get('content-type') || '';

    if (request.method === 'HEAD' || !contentType.includes('text/html')) {
      return response;
    }

    const html = stripDuplicateGeneratorScripts(await response.text());
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('x-sonara-generator-stability', 'native-react-controls-v1');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
