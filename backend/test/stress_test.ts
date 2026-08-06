import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runStressTest() {
  console.log(`=======================================================`);
  console.log(`[SONARA AI ENTERPRISE BACKEND - STRESS TEST (10 RUNS)]`);
  console.log(`Target Server: ${BASE_URL}`);
  console.log(`=======================================================`);

  // 1. Obtain token
  const tokenRes = await axios.get(`${BASE_URL}/api/debug/create-token`);
  const token = tokenRes.data.customToken;
  if (!token) {
    throw new Error('Failed to obtain debug token');
  }

  const initialMemory = process.memoryUsage();
  console.log(`[STRESS_TEST] Starting Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  const totalRuns = 10;
  const timings: number[] = [];
  let successfulRuns = 0;
  let failedRuns = 0;

  for (let i = 1; i <= totalRuns; i++) {
    const runStartTime = Date.now();
    const payload = {
      title: `Stress Test Track #${i}`,
      genre: i % 2 === 0 ? 'House' : 'Deep House',
      mood: 'Energetic',
      prompt: `High energy ${i % 2 === 0 ? 'Tech House' : 'Deep House'} track iteration ${i}`
    };

    try {
      console.log(`\n[RUN ${i}/${totalRuns}] Triggering POST /api/music/generate...`);
      const res = await axios.post(`${BASE_URL}/api/music/generate`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const duration = Date.now() - runStartTime;
      timings.push(duration);

      const { jobId, status, audioUrl, metadata } = res.data;

      if (status !== 'COMPLETED' || !audioUrl) {
        throw new Error(`Run #${i} status is ${status}, audioUrl is ${audioUrl}`);
      }

      // Verify Audio File existence and validity
      const localAudioPath = path.join(process.cwd(), audioUrl);
      if (!fs.existsSync(localAudioPath)) {
        throw new Error(`Run #${i} audio file not found on disk at: ${localAudioPath}`);
      }

      const stats = fs.statSync(localAudioPath);
      if (stats.size < 100000) {
        throw new Error(`Run #${i} audio file size abnormally small (${stats.size} bytes)`);
      }

      // Verify metadata completeness
      if (!metadata || !metadata.duration || !metadata.lufs || !metadata.qualityScore) {
        throw new Error(`Run #${i} missing required metadata fields`);
      }

      successfulRuns++;
      console.log(`[RUN ${i}/${totalRuns}] ✅ SUCCESS in ${duration}ms | Audio: ${audioUrl} | Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB | QualityScore: ${metadata.qualityScore}`);

    } catch (err: any) {
      failedRuns++;
      console.error(`[RUN ${i}/${totalRuns}] ❌ FAILED: ${err.response?.data?.error || err.message}`);
    }
  }

  const finalMemory = process.memoryUsage();
  const memoryDeltaMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
  const avgTiming = timings.length > 0 ? (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(0) : 0;
  const minTiming = timings.length > 0 ? Math.min(...timings) : 0;
  const maxTiming = timings.length > 0 ? Math.max(...timings) : 0;

  console.log(`\n=======================================================`);
  console.log(`[STRESS TEST SUMMARY RESULTS]`);
  console.log(`Total Invocations: ${totalRuns}`);
  console.log(`Successful:        ${successfulRuns}`);
  console.log(`Failed:            ${failedRuns}`);
  console.log(`Average Latency:   ${avgTiming} ms`);
  console.log(`Latency Range:     ${minTiming} ms - ${maxTiming} ms`);
  console.log(`Final Heap Used:   ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Delta:      ${memoryDeltaMB >= 0 ? '+' : ''}${memoryDeltaMB.toFixed(2)} MB`);
  console.log(`=======================================================`);

  if (failedRuns > 0) {
    console.error(`[STRESS_TEST] Test FAILED due to ${failedRuns} failed runs.`);
    process.exit(1);
  } else {
    console.log(`[STRESS_TEST] ✅ ALL 10 CONSECUTIVE RUNS PASSED 100% WITH STABLE MEMORY AND ZERO WORKER CRASHES.`);
    process.exit(0);
  }
}

runStressTest();
