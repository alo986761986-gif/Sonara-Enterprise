import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const statusArgument = process.argv[2];
assert.ok(statusArgument, 'Status JSON path is required');
const statusPath = path.resolve(statusArgument);
const projectRoot = path.resolve(process.argv[3] || process.cwd());
assert.ok(fs.existsSync(statusPath), `Status JSON missing: ${statusPath}`);
assert.ok(fs.statSync(statusPath).isFile(), `Status JSON is not a file: ${statusPath}`);

const job = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
assert.equal(job.status, 'COMPLETED', `Job status is ${job.status}: ${job.error || job.metadata?.error || ''}`);

const metadata = job.metadata || {};
const arrangement = metadata.arrangement || {};
const mastering = metadata.dspMastering || {};
const separation = metadata.stemSeparation || {};

assert.equal(arrangement.timeSignature, '4/4');
assert.ok(Number(arrangement.totalBars) >= 4, 'No complete bars reported');
assert.equal(Number(arrangement.totalBars) % 4, 0, 'Arrangement is not aligned to a four-bar phrase');
assert.equal(mastering.inputSupported, true, mastering.bypassReason || 'Mastering input unsupported');
assert.equal(mastering.barsAligned, true, 'Master WAV is not aligned to complete bars');
assert.ok(Math.abs(Number(mastering.integratedLufs) - (-14)) <= 0.2, `LUFS out of tolerance: ${mastering.integratedLufs}`);
assert.ok(Number(mastering.truePeakDbtp) <= -0.95, `True peak exceeds ceiling: ${mastering.truePeakDbtp}`);
assert.ok(Number(mastering.stereoPhaseCorrelation) >= 0.7, `Stereo phase correlation unsafe: ${mastering.stereoPhaseCorrelation}`);

assert.equal(separation.status, 'COMPLETED');
assert.equal(separation.engine, 'Demucs v4');
assert.equal(separation.model, 'htdemucs_ft');
assert.equal(separation.device, 'cuda');

const audioUrl = String(job.audioUrl || '');
assert.match(audioUrl, /^\/storage\/audio\/.+\.wav$/);
const masterPath = path.join(projectRoot, audioUrl.replace(/^\//, ''));
assert.ok(fs.existsSync(masterPath), `Master WAV missing: ${masterPath}`);
const master = fs.readFileSync(masterPath);
assert.equal(master.toString('ascii', 0, 4), 'RIFF');
assert.equal(master.toString('ascii', 8, 12), 'WAVE');
assert.equal(master.readUInt16LE(22), 2, 'Master is not stereo');
assert.equal(master.readUInt32LE(24), 44_100, 'Master is not 44.1 kHz');
assert.equal(master.readUInt16LE(34), 16, 'Master is not PCM16');
assert.ok(master.length > 44, 'Master WAV contains no audio');

const checkedStems: Record<string, { path: string; bytes: number }> = {};
for (const name of ['drums', 'bass', 'vocals', 'other']) {
  const stem = separation.stems?.[name];
  assert.ok(stem, `Missing ${name} stem metadata`);
  const stemPath = path.resolve(String(stem.path || ''));
  assert.ok(fs.existsSync(stemPath), `Missing ${name} stem file: ${stemPath}`);
  const bytes = fs.statSync(stemPath).size;
  assert.ok(bytes > 44, `${name} stem is empty`);
  checkedStems[name] = { path: stemPath, bytes };
}

const report = {
  status: 'PASS',
  testedAt: new Date().toISOString(),
  jobId: job.jobId,
  master: {
    path: masterPath,
    bytes: master.length,
    sampleRate: master.readUInt32LE(24),
    channels: master.readUInt16LE(22),
    bitDepth: master.readUInt16LE(34),
    lufs: mastering.integratedLufs,
    truePeakDbtp: mastering.truePeakDbtp,
    stereoPhaseCorrelation: mastering.stereoPhaseCorrelation
  },
  arrangement: {
    bpm: metadata.bpm,
    totalBars: arrangement.totalBars,
    alignedDurationSec: arrangement.alignedDurationSec,
    sections: arrangement.sections
  },
  separation: {
    engine: separation.engine,
    model: separation.model,
    device: separation.device,
    stems: checkedStems
  }
};

const reportPath = path.join(path.dirname(statusPath), `runpod-final-report-${job.jobId}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);
