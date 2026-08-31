const baseUrl = (process.env.LEVO2_RESEARCH_API_URL || 'http://127.0.0.1:8012').replace(/\/+$/, '');
const apiKey = (process.env.LEVO2_RESEARCH_API_KEY || '').trim();

const headers = apiKey
  ? { Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey }
  : {};

async function main() {
  const healthResponse = await fetch(`${baseUrl}/health`, { headers });
  const health = await healthResponse.json();
  console.log('LEVO2 HEALTH', JSON.stringify(health, null, 2));

  if (!healthResponse.ok || health.ready !== true) {
    throw new Error(`LeVo 2 worker not ready: HTTP ${healthResponse.status}`);
  }

  if (process.env.LEVO2_RUN_GENERATION_SMOKE !== '1') {
    console.log('Health smoke passed. Set LEVO2_RUN_GENERATION_SMOKE=1 to run one real R&D generation.');
    return;
  }

  const payload = {
    research_only: true,
    title: 'Sonara LeVo2 Smoke',
    genre: 'Deep House',
    mood: 'Dark, emotional, hypnotic',
    prompt: 'deep house, dark, emotional, hypnotic, electronic, synthesizer, deep bass, atmospheric pads, club',
    lyrics: '[intro-short]; [verse] Lost inside the midnight light; [chorus] Take me deeper through the night; [outro-short]',
    duration_sec: 30,
    generate_type: 'mixed',
    auto_prompt_audio_type: 'Electronic'
  };

  const response = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log('LEVO2 GENERATE', JSON.stringify(result, null, 2));

  if (!response.ok || !result.audio_url) {
    throw new Error(`LeVo 2 generation smoke failed: HTTP ${response.status}`);
  }

  const audioResponse = await fetch(new URL(result.audio_url, `${baseUrl}/`), { headers });
  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  if (!audioResponse.ok || bytes.length < 100000) {
    throw new Error(`LeVo 2 audio smoke failed: HTTP ${audioResponse.status}, bytes=${bytes.length}`);
  }

  console.log(`LeVo 2 R&D generation smoke passed: ${bytes.length} bytes.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
