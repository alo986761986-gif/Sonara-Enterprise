import webRuntime from './sonara-web-generator-stability.mjs';
import engineV18 from './sonara-engine-v18-fast-hq.mjs';
import { isVideoApiRequest, recoverVideoApi } from './sonara-video-api-recovery.mjs';
import { injectVideoUiScript, videoUiScriptResponse } from './sonara-video-ui-edge.mjs';

const API_HOST = 'api.sonaraenterprise.com';
const VIDEO_UI_SCRIPT_PATH = '/sonara-video-ui-edge.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname !== API_HOST && url.pathname === VIDEO_UI_SCRIPT_PATH) {
      return videoUiScriptResponse();
    }

    if (url.hostname !== API_HOST && isVideoApiRequest(request)) {
      return recoverVideoApi(request, { env, ctx });
    }

    if (url.hostname === API_HOST) {
      return engineV18.fetch(request, env, ctx);
    }

    const response = await webRuntime.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return injectVideoUiScript(response);
    }
    return response;
  }
};
