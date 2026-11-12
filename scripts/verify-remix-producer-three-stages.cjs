'use strict';
/** SONARA producer contract regression test; no network and no customer jobs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const file = 'src/components/remix/sonaraRemixV7Director.ts';
const source = fs.readFileSync(file, 'utf8');
const js = ts.transpileModule(source, {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
const errors = (js.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'TypeScript producer source must transpile');
const module = {exports: {}};
vm.runInNewContext(js.outputText, {module, exports: module.exports}, {timeout: 2000});
const {v7Directions, addV7Direction} = module.exports;
assert.equal(typeof v7Directions, 'function');
assert.equal(typeof addV7Direction, 'function');

const intent = {vocalFlow: 85,houseGroove:90,harmony:85,arrangement:80};
const options = v7Directions(intent);
assert.equal(options.length, 3);
const original = 'Create a fresh organic House composition and preserve expressive human vocals. ';
for (const option of options) {
  const text = addV7Direction(original, option);
  assert(text.startsWith(original.trim()), 'Creator intent must lead');
  assert(text.length <= 6500, 'Gateway prompt limit');
  const seen = text.slice(0, 1000);
  for (const stage of ['ARRANGEMENT:', 'VOCALS:', 'MASTER:']) {
    assert(seen.includes(stage), stage + ' missing from GPU creatorPrompt budget in ' + option.id);
  }
  for (const rule of ['release gate', 'not a mashup', 'one 4/4 pulse']) {
    assert(seen.includes(rule), rule + ' missing from ' + option.id);
  }
}
const extended = original.repeat(90);
const long = addV7Direction(extended, options[0]);
assert(long.length <= 6500);
for(const stage of ['ARRANGEMENT:', 'VOCALS:', 'MASTER:']) {
  assert(long.slice(0,1000).includes(stage), 'Long prompt lost '+stage);
}
console.log('SONARA_PRODUCER_THREE_STAGES_VERIFIED=true');
console.log('SONARA_GPU_CREATOR_PROMPT_BUDGET_VERIFIED=true');
console.log('SONARA_QUALITY_GATE_PRESERVED=true');
