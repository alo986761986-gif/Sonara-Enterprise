import webRuntime from './sonara-web-generator-stability.mjs';
import engineV15 from './sonara-engine-v15-authoritative-prompt.mjs';
import { isVideoApiRequest, recoverVideoApi } from './sonara-video-api-recovery.mjs';

const API_HOST = 'api.sonaraenterprise.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname !== API_HOST && isVideoApiRequest(request)) {
      return recoverVideoApi(request);
    }
    if (url.hostname === API_HOST) {
      return engineV15.fetch(request, env, ctx);
    }
    return webRuntime.fetch(request, env, ctx);
  }
};