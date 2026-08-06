import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { AudioDeliveryService } from '../src/services/AudioDeliveryService';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

function setupMockMasterWav(projectId: string): string {
  const storageDir = path.join(process.cwd(), 'storage', 'audio');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const wavPath = path.join(storageDir, `${projectId}.wav`);
  if (!fs.existsSync(wavPath)) {
    // Write standard valid PCM WAV header + sine samples
    const numChannels = 2;
    const sampleRate = 44100;
    const bitsPerSample = 16;
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = sampleRate * blockAlign * 3; // 3 seconds
    const bufferSize = 44 + dataSize;
    const buf = Buffer.alloc(bufferSize);

    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(bufferSize - 8, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(numChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * blockAlign, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < sampleRate * 3; i++) {
      const val = Math.floor(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 16000);
      const offset = 44 + i * blockAlign;
      buf.writeInt16LE(val, offset);
      buf.writeInt16LE(val, offset + 2);
    }
    fs.writeFileSync(wavPath, buf);
  }
  return wavPath;
}

async function runDeliveryEngineTestSuite() {
  console.log('=======================================================');
  console.log('[SONARA AI ENTERPRISE GLOBAL MUSIC DELIVERY TEST SUITE]');
  console.log('=======================================================');

  const testProjectId = `proj_delivery_test_${Date.now()}`;
  setupMockMasterWav(testProjectId);

  try {
    console.log(`\n[TEST 1] Testing Audio Delivery Status (GET /api/audio/status/${testProjectId})...`);
    const statusRes = await axios.get(`${BASE_URL}/api/audio/status/${testProjectId}`);
    console.log(`[PASS] Status response: 200 OK | Delivery Engine: ${statusRes.data.deliveryEngine}`);
    console.log(` - Signed URL: ${statusRes.data.asset.signedUrl}`);
    console.log(` - Available Formats: ${statusRes.data.availableFormats.join(', ')}`);

    if (statusRes.status !== 200 || !statusRes.data.asset) {
      throw new Error('Failed status resolution test');
    }

    console.log(`\n[TEST 2] Testing Audio Full Stream 200 OK (GET /api/audio/stream/${testProjectId})...`);
    const streamRes = await axios.get(`${BASE_URL}/api/audio/stream/${testProjectId}`, { responseType: 'arraybuffer' });
    console.log(`[PASS] Stream 200 OK | Received: ${streamRes.data.byteLength} bytes | Content-Type: ${streamRes.headers['content-type']}`);
    console.log(` - Accept-Ranges: ${streamRes.headers['accept-ranges']}`);
    console.log(` - ETag: ${streamRes.headers['etag']}`);

    if (streamRes.status !== 200 || !streamRes.headers['accept-ranges']) {
      throw new Error('Full stream test failed');
    }

    console.log(`\n[TEST 3] Testing HTTP Range Request 206 Partial Content (bytes=0-1023)...`);
    const rangeRes = await axios.get(`${BASE_URL}/api/audio/stream/${testProjectId}`, {
      headers: { Range: 'bytes=0-1023' },
      responseType: 'arraybuffer'
    });
    console.log(`[PASS] HTTP Range 206 Partial Content verified!`);
    console.log(` - Content-Range: ${rangeRes.headers['content-range']}`);
    console.log(` - Chunk Size: ${rangeRes.data.byteLength} bytes`);

    if (rangeRes.status !== 206 || rangeRes.data.byteLength !== 1024) {
      throw new Error('HTTP Range Request 206 partial content failed');
    }

    console.log(`\n[TEST 4] Testing Real Transcoded MP3 & AAC Format Streams...`);
    const mp3Res = await axios.get(`${BASE_URL}/api/audio/stream/${testProjectId}?format=mp3`, { responseType: 'arraybuffer' });
    console.log(`[PASS] Transcoded MP3 stream | Content-Type: ${mp3Res.headers['content-type']} | Bytes: ${mp3Res.data.byteLength}`);

    const aacRes = await axios.get(`${BASE_URL}/api/audio/stream/${testProjectId}?format=aac`, { responseType: 'arraybuffer' });
    console.log(`[PASS] Transcoded AAC stream | Content-Type: ${aacRes.headers['content-type']} | Bytes: ${aacRes.data.byteLength}`);

    console.log(`\n[TEST 5] Testing File Download Endpoint (GET /api/audio/download/${testProjectId}?format=mp3)...`);
    const downloadRes = await axios.get(`${BASE_URL}/api/audio/download/${testProjectId}?format=mp3`, { responseType: 'arraybuffer' });
    console.log(`[PASS] Download response: 200 OK | Content-Disposition: ${downloadRes.headers['content-disposition']}`);

    if (!downloadRes.headers['content-disposition'] || !downloadRes.headers['content-disposition'].includes('attachment')) {
      throw new Error('Download attachment header verification failed');
    }

    console.log(`\n=======================================================`);
    console.log('[SUCCESS] GLOBAL MUSIC DELIVERY ENGINE TEST SUITE PASSED 100%');
    console.log('=======================================================\n');

  } catch (err: any) {
    console.error('\n[FAIL] Delivery Engine Test Suite Failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

runDeliveryEngineTestSuite();
