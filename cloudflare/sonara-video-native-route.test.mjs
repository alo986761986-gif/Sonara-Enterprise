import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./sonara-ab-player-visibility-edge.mjs', import.meta.url), 'utf8');
const nativeAuthBlock = source.match(/publicHost\s*&&\s*\([\s\S]*?\)\s*\)\s*\{\s*const authResponse/);

assert.ok(nativeAuthBlock, 'Native account route block not found.');
assert.match(nativeAuthBlock[0], /\/api\/sonara-auth\//);
assert.match(nativeAuthBlock[0], /\/api\/billing\/status/);
assert.match(nativeAuthBlock[0], /\/api\/video\/status/);
assert.match(source, /runtime\.fetch\(request, env, ctx\)/);

console.log('SONARA native session serves Video AI credits from the durable account store.');
