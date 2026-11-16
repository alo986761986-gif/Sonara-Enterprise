import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-real-music-v3-edge.mjs';
import { withGatewayVerifier } from './sonara-gateway-verifier.mjs';
import { handleNativeOpenModelCreator } from './sonara-native-open-model-entry.mjs';

export { SonaraJobState, SonaraAuthStore };

// Creator-specific open models enter before the inherited ACE-Step / Dual
// middleware chain. Their authenticated R2 queue is separate; never retry
// an enqueue through the legacy generation stack.
const nativeOpenModelEntry = {
  async fetch(request, env, ctx) {
    const reply = await handleNativeOpenModelCreator(request, env, ctx);
    if (reply) return reply;
    return runtime.fetch(request, env, ctx);
  }
};

export default withGatewayVerifier(nativeOpenModelEntry);
