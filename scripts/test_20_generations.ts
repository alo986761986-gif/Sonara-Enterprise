import { JobQueueWorker } from '../backend/src/workers/JobQueueWorker';
import fs from 'fs';
import path from 'path';

async function run20GenerationsTest() {
  console.log('=== STARTING 20 CONSECUTIVE GENERATIONS VALIDATION TEST ===');
  let successCount = 0;
  const totalGenerations = 20;

  const genres = ['House', 'Tech House', 'Melodic House', 'Deep House', 'Techno', 'Synthwave', 'Trance', 'Hip Hop', 'Ambient', 'Progressive House'];

  for (let i = 1; i <= totalGenerations; i++) {
    const selectedGenre = genres[(i - 1) % genres.length];
    const jobId = `test_gen_batch_${Date.now()}_${i}`;
    console.log(`\n--- [Generation ${i}/${totalGenerations}] Testing ${selectedGenre} ---`);

    const payload = {
      prompt: `Sonara V12 High Fidelity Track #${i} - ${selectedGenre} Anthem`,
      genre: selectedGenre,
      mood: 'Energetic',
      lyrics: '',
      title: `Track #${i}`,
      bpm: 124 + (i % 8),
      duration: 10
    };

    JobQueueWorker.enqueueJob(jobId, payload, 'test-system-user', 30000);
    const result = await JobQueueWorker.executeJobWithRetries(jobId);

    if (!result || result.status !== 'COMPLETED' || !result.audioUrl) {
      console.error(`❌ [Generation ${i}] FAILED: Invalid job result state or missing audioUrl`, result);
      continue;
    }

    // Convert relative URL (/storage/audio/filename.wav) to local file path
    const localFilePath = path.join(process.cwd(), result.audioUrl.startsWith('/') ? result.audioUrl.substring(1) : result.audioUrl);

    if (!fs.existsSync(localFilePath)) {
      console.error(`❌ [Generation ${i}] FAILED: Audio file does not exist on disk at ${localFilePath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(localFilePath);
    const fileSize = fileBuffer.length;

    // Validate WAV header
    const isRiff = fileBuffer.toString('utf8', 0, 4) === 'RIFF';
    const isWave = fileBuffer.toString('utf8', 8, 12) === 'WAVE';

    if (!isRiff || !isWave) {
      console.error(`❌ [Generation ${i}] FAILED: File at ${localFilePath} is not a valid WAV file.`);
      continue;
    }

    if (fileSize < 50000) {
      console.error(`❌ [Generation ${i}] FAILED: File size is suspiciously small (${fileSize} bytes)`);
      continue;
    }

    // Parse WAV params from header
    const numChannels = fileBuffer.readUInt16LE(22);
    const sampleRate = fileBuffer.readUInt32LE(24);

    console.log(`✅ [Generation ${i}/${totalGenerations}] SUCCESS!`);
    console.log(`   - Job ID: ${jobId}`);
    console.log(`   - Audio URL: ${result.audioUrl}`);
    console.log(`   - File Size: ${fileSize} bytes`);
    console.log(`   - Sample Rate: ${sampleRate} Hz`);
    console.log(`   - Channels: ${numChannels} (Stereo)`);
    console.log(`   - Quality Score: ${result.metadata?.qualityScore}/10`);

    successCount++;
  }

  console.log(`\n==================================================`);
  console.log(`TEST RESULTS: ${successCount}/${totalGenerations} GENERATIONS PRODUCED VALID AUDIO FILES`);
  console.log(`==================================================\n`);

  if (successCount === totalGenerations) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run20GenerationsTest().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
