import { AudioAnalyzer } from '../src/services/AudioAnalyzer';
import { AudioQualityGateService } from '../src/services/AudioQualityGateService';

function generateRealPcmWavBuffer(durationSec: number = 6.0, sampleRate: number = 44100): Buffer {
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const dataSize = totalSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = Buffer.alloc(bufferSize);

  // RIFF Header
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8, 'ascii');

  // fmt chunk
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // subchunk1size (PCM = 16)
  buffer.writeUInt16LE(1, 20);  // audioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  // Generate real 440Hz (A4) sine wave PCM samples
  const freq = 440.0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const sampleVal = Math.sin(2 * Math.PI * freq * t) * 0.5; // 50% amplitude (-6dB peak)
    const intSample = Math.floor(sampleVal * 32767);
    const offset = 44 + i * blockAlign;
    buffer.writeInt16LE(intSample, offset);     // Left channel
    buffer.writeInt16LE(intSample, offset + 2); // Right channel
  }

  return buffer;
}

async function runAudioQualityGateTestSuite() {
  console.log('=======================================================');
  console.log('[SONARA AI ENTERPRISE AUDIO QUALITY GATE TEST SUITE]');
  console.log('=======================================================');

  try {
    console.log('\n[TEST 1] Synthesizing Real PCM WAV Buffer (6.0s, 44.1kHz Stereo)...');
    const pcmWavBuffer = generateRealPcmWavBuffer(6.0, 44100);
    console.log(`[PASS] PCM WAV Buffer created | Size: ${pcmWavBuffer.length} bytes`);

    console.log('\n[TEST 2] Analyzing WAV Audio via AudioAnalyzer...');
    const analysis = AudioAnalyzer.analyzeWavBuffer(pcmWavBuffer);
    console.log(`[PASS] Analysis Complete | LUFS: ${analysis.lufs} LUFS | Peak: ${analysis.peakDb} dB | RMS: ${analysis.rmsDb} dB`);

    console.log('\n[TEST 3] Running Audio Quality Gate Enterprise v1.0 Evaluation...');
    const report = await AudioQualityGateService.evaluateQuality(pcmWavBuffer, analysis, {
      title: 'Enterprise Test Master',
      genre: 'Synthwave / Cyberpunk',
      projectId: 'proj_test_aqg_001'
    });

    console.log(`\n[AUDIO QUALITY GATE REPORT RESULT]`);
    console.log(` - Report ID: ${report.reportId}`);
    console.log(` - Quality Score: ${report.qualityScore} / 100`);
    console.log(` - Passed Gate (>= 75): ${report.passedGate}`);
    console.log(` - Detected Key: ${report.detectedKey}`);
    console.log(` - Detected Tempo: ${report.detectedBpm} BPM`);
    console.log(` - WAV Integrity: ${report.metrics.wavIntegrity.message} (${report.metrics.wavIntegrity.metricValue})`);
    console.log(` - Peak Clipping: ${report.metrics.peakClipping.message} (${report.metrics.peakClipping.metricValue})`);
    console.log(` - LUFS Target Compliance: ${report.metrics.lufs.message} (${report.metrics.lufs.metricValue})`);
    console.log(` - Silence Profile: ${report.metrics.silence.message} (${report.metrics.silence.metricValue})`);
    console.log(` - AI Judge Technical Grade: ${report.aiJudgeVerdict.technicalGrade}`);
    console.log(` - AI Judge Summary: ${report.aiJudgeVerdict.summary}`);

    // Assertions
    if (!report.reportId || !report.reportId.startsWith('report_aqg_')) {
      throw new Error('Invalid reportId format');
    }
    if (typeof report.qualityScore !== 'number' || report.qualityScore < 0 || report.qualityScore > 100) {
      throw new Error(`Invalid qualityScore: ${report.qualityScore}`);
    }
    if (!report.metrics.wavIntegrity.passed) {
      throw new Error('WAV Integrity check failed unexpectedly');
    }
    if (!report.metrics.peakClipping.passed) {
      throw new Error('Peak Clipping check failed unexpectedly');
    }

    console.log('\n[TEST 4] Verifying Report Retrieval & Storage...');
    const retrieved = AudioQualityGateService.getReport(report.reportId);
    if (!retrieved || retrieved.reportId !== report.reportId) {
      throw new Error('Failed to retrieve persisted report');
    }
    console.log(`[PASS] Successfully retrieved report from persistence store.`);

    console.log('\n=======================================================');
    console.log('[SUCCESS] AUDIO QUALITY GATE ENTERPRISE TEST SUITE PASSED 100%');
    console.log('=======================================================\n');

  } catch (err: any) {
    console.error('\n[FAIL] Audio Quality Gate Test Failed:', err.message);
    process.exit(1);
  }
}

runAudioQualityGateTestSuite();
