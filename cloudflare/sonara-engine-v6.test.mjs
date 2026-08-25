import assert from "node:assert/strict";
import test from "node:test";

import sonaraWorker, {
  alignDurationToCompleteBars,
  analyzePcmSamples,
  buildProfessionalEnginePayload,
  chooseProfessionalModel,
  evaluateGenerationCandidates,
  normalizeRequest,
  parseWavHeader,
  resolveCreativeControls,
  scoreGenerationCandidate,
  summarizeQualityDiagnostics,
  validateGenerationRequest,
} from "./sonara-engine-v6.mjs";

const baseRequest = {
  prompt: [
    "USER INTENT",
    "Create a focused club track.",
    "MUSICAL IDENTITY",
    "Family: Electronic / Dance",
    "Genre: House",
    "Subgenre: Tech House",
    "Mood: Energetic",
    "TECHNICAL PARAMETERS",
    "Tempo: exactly 126 BPM",
    "Key: F minor",
    "Duration: exactly 180 seconds",
    "VOCALS",
    "Strictly instrumental: do not generate sung, spoken, whispered or sampled words.",
  ].join("\n"),
  rawPrompt: "Create a focused club track.",
  genreFamily: "Electronic / Dance",
  genre: "House",
  subgenre: "Tech House",
  mood: "Energetic",
  bpm: 126,
  key: "F minor",
  durationSec: 180,
  vocalMode: "instrumental",
  lyrics: "",
  title: "Club Tool",
  engineId: "sonara-engine-v6",
};

test("accepts a coherent deterministic generation request", () => {
  const result = validateGenerationRequest(baseRequest);

  assert.equal(result.genreFamily, "Electronic / Dance");
  assert.equal(result.genre, "House");
  assert.equal(result.subgenre, "Tech House");
  assert.equal(result.bpm, 126);
  assert.equal(result.vocalMode, "instrumental");
  assert.equal(result.qualityGate.status, "PASSED");
});

test("maps Weirdness and Style Influence to real ACE-Step controls", () => {
  const restrained = resolveCreativeControls({ weirdness: 0, styleInfluence: 0 });
  const experimental = resolveCreativeControls({ weirdness: 100, styleInfluence: 100 });
  assert.equal(restrained.inferMethod, "ode");
  assert.equal(experimental.inferMethod, "sde");
  assert.ok(experimental.lmTemperature > restrained.lmTemperature);
  assert.ok(experimental.lmTopP > restrained.lmTopP);
  assert.ok(experimental.lmCfgScale > restrained.lmCfgScale);

  const normalized = normalizeRequest({ ...baseRequest, weirdness: 88, styleInfluence: 76 });
  assert.equal(normalized.generationSpec.weirdness, 88);
  assert.equal(normalized.generationSpec.styleInfluence, 76);
  assert.equal(normalized.payload.infer_method, "sde");
});

test("forwards the final prompt without hidden rewriting", () => {
  const normalized = normalizeRequest(baseRequest);

  assert.equal(normalized.payload.prompt, baseRequest.prompt);
  assert.equal(normalized.payload.thinking, true);
  assert.equal(normalized.payload.use_cot_caption, true);
  assert.equal(normalized.payload.constrained_decoding, true);
  assert.equal(normalized.payload.batch_size, 2);
  assert.equal(normalized.payload.audio_format, "wav");
  assert.equal(normalized.payload.time_signature, "4");
  assert.equal(normalized.generationSpec.rawPrompt, baseRequest.rawPrompt);
  assert.equal(normalized.generationSpec.subgenre, "Tech House");
  assert.equal(normalized.generationSpec.outputFormat, "wav");
});

test("rejects a prompt that does not reflect the selected subgenre", () => {
  assert.throws(
    () => validateGenerationRequest({
      ...baseRequest,
      prompt: baseRequest.prompt.replace("Tech House", "Deep House"),
    }),
    /selected subgenre: Tech House/,
  );
});

test("requires the authoritative musical hierarchy", () => {
  assert.throws(
    () => validateGenerationRequest({
      ...baseRequest,
      genreFamily: "",
    }),
    /genreFamily is required/,
  );
});

test("accepts a detailed professional prompt with long lyrics and style instructions", () => {
  const detailedPrompt = `${baseRequest.prompt}\n${"Detailed style instruction. ".repeat(340)}`;
  assert.ok(detailedPrompt.length > 8000);
  assert.doesNotThrow(() => validateGenerationRequest({
    ...baseRequest,
    prompt: detailedPrompt,
  }));
});

test("accepts male, female and duet vocal modes when exact lyrics are supplied", () => {
  const lyrics = "Hold the light through the night\nWe will find our way";
  const requests = [
    ["male", "Use one clearly male lead vocalist with a natural expressive register."],
    ["female", "Use one clearly female lead vocalist with a natural expressive register."],
    ["duet", "Use two clearly distinct lead vocalists: one male and one female, alternating naturally."],
  ];

  for (const [vocalMode, vocalDirection] of requests) {
    const prompt = baseRequest.prompt.replace(
      "Strictly instrumental: do not generate sung, spoken, whispered or sampled words.",
      `${vocalDirection}\n${lyrics}`,
    );
    const result = validateGenerationRequest({
      ...baseRequest,
      prompt,
      vocalMode,
      lyrics,
    });
    assert.equal(result.vocalMode, vocalMode);
    assert.equal(result.lyrics, lyrics);
  }
});

test("rejects a selected vocal mode without lyrics", () => {
  assert.throws(
    () => validateGenerationRequest({
      ...baseRequest,
      vocalMode: "male",
      prompt: baseRequest.prompt.replace(
        "Strictly instrumental: do not generate sung, spoken, whispered or sampled words.",
        "Use one clearly male lead vocalist.",
      ),
    }),
    /male vocal mode requires lyrics/,
  );
});

test("aligns the render target to a complete musical bar", () => {
  assert.equal(alignDurationToCompleteBars(30, 124, "4"), 30.968);
  const normalized = normalizeRequest({
    ...baseRequest,
    prompt: baseRequest.prompt.replace("126 BPM", "124 BPM").replace("180 seconds", "30 seconds"),
    durationSec: 30,
    bpm: 124,
  });
  assert.equal(normalized.generationSpec.requestedDurationSec, 30);
  assert.equal(normalized.generationSpec.renderDurationSec, 30.968);
  assert.equal(normalized.payload.audio_duration, 30.968);
});

test("accepts an eight-minute Studio generation", () => {
  const normalized = normalizeRequest({
    ...baseRequest,
    prompt: baseRequest.prompt.replace("180 seconds", "480 seconds"),
    durationSec: 480,
  });
  assert.equal(normalized.generationSpec.requestedDurationSec, 480);
  assert.equal(normalized.payload.audio_duration, 480);
});

test("selects the best available ACE-Step professional model", () => {
  assert.equal(chooseProfessionalModel([
    "acestep-v15-turbo",
    "acestep-v15-xl-turbo",
    "acestep-v15-xl-sft",
  ], "acestep-v15-turbo"), "acestep-v15-xl-sft");
  assert.equal(chooseProfessionalModel(["acestep-v15-turbo"], "acestep-v15-turbo"), "acestep-v15-turbo");
  const xlSft = buildProfessionalEnginePayload({ prompt: "Jazz Fusion" }, "acestep-v15-xl-sft");
  assert.equal(xlSft.inference_steps, 50);
  assert.equal(xlSft.guidance_scale, 7);
  assert.equal(xlSft.use_adg, true);
});

test("rejects metadata drift and ranks a coherent generation candidate", () => {
  const spec = normalizeRequest(baseRequest).generationSpec;
  const outputs = [
    {
      file: "/tmp/wrong.wav",
      prompt: baseRequest.prompt.replace("Tech House", "Deep House"),
      lyrics: "",
      metas: { bpm: 132, duration: spec.renderDurationSec, keyscale: "C Major" },
    },
    {
      file: "/tmp/professional.wav",
      prompt: baseRequest.prompt,
      lyrics: "",
      metas: { bpm: 126, duration: spec.renderDurationSec, keyscale: "F minor" },
      dit_model: "acestep-v15-xl-sft",
    },
  ];
  const evaluation = evaluateGenerationCandidates(outputs, spec);
  assert.equal(evaluation.reports[0].valid, false);
  assert.equal(evaluation.ranked.length, 1);
  assert.equal(evaluation.ranked[0].report.index, 1);
  assert.equal(evaluation.ranked[0].report.score, 100);
});

test("accepts omitted response echoes but still rejects explicit metadata conflicts", () => {
  const spec = normalizeRequest(baseRequest).generationSpec;
  const omitted = scoreGenerationCandidate({ file: "/tmp/output.wav", prompt: "", lyrics: "[Instrumental]", metas: {} }, spec);
  assert.equal(omitted.valid, true);
  assert.ok(omitted.warnings.some(value => value.includes("style echo")));

  const conflicting = scoreGenerationCandidate({
    file: "/tmp/output.wav",
    prompt: "Deep House with soft pads",
    lyrics: "",
    metas: { bpm: 140, duration: spec.renderDurationSec, keyscale: "C Major" },
  }, spec);
  assert.equal(conflicting.valid, false);
  assert.ok(conflicting.errors.some(value => value.includes("subgenre")));
  assert.match(
    summarizeQualityDiagnostics([{ errors: conflicting.errors, audioGate: { errors: ["not a RIFF/WAVE file"] } }]),
    /RIFF\/WAVE/,
  );
});

function createTestWav(durationSec = 1, sampleRate = 44100) {
  const channels = 2;
  const bits = 16;
  const blockAlign = channels * bits / 8;
  const frames = Math.floor(durationSec * sampleRate);
  const dataSize = frames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin(2 * Math.PI * 440 * frame / sampleRate) * 0.5 * 32767);
    const offset = 44 + frame * blockAlign;
    buffer.writeInt16LE(sample, offset);
    buffer.writeInt16LE(sample, offset + 2);
  }
  return buffer;
}

test("parses and measures a real stereo PCM WAV", () => {
  const wav = createTestWav();
  const header = parseWavHeader(wav.subarray(0, 65536));
  assert.equal(header.valid, true);
  assert.equal(header.sampleRate, 44100);
  assert.equal(header.channels, 2);
  assert.equal(header.bitsPerSample, 16);
  assert.equal(header.durationSec, 1);
  const signal = analyzePcmSamples(wav.subarray(44), header);
  assert.equal(signal.valid, true);
  assert.ok(signal.rmsDb > -10 && signal.rmsDb < -8);
  assert.ok(signal.peakDb > -7 && signal.peakDb < -5);
  assert.equal(signal.clippingRatio, 0);
});

test("completes a job only after the returned WAV passes the real-audio gate", async () => {
  const request = {
    ...baseRequest,
    prompt: baseRequest.prompt.replace("126 BPM", "124 BPM").replace("180 seconds", "30 seconds"),
    bpm: 124,
    durationSec: 30,
  };
  const renderDuration = alignDurationToCompleteBars(30, 124, "4");
  const wav = createTestWav(renderDuration, 48000);
  const cacheEntries = new Map();
  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  let audioHeadRequests = 0;
  globalThis.caches = {
    default: {
      async put(key, value) { cacheEntries.set(key.url, value.clone()); },
      async match(key) { return cacheEntries.get(key.url)?.clone(); },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/v1/models")) {
      return Response.json({ data: { models: [{ name: "acestep-v15-xl-sft" }], default_model: "acestep-v15-xl-sft" } });
    }
    if (href.endsWith("/release_task")) return Response.json({ data: { task_id: "professional-task" } });
    if (href.endsWith("/query_result")) {
      return Response.json({
        data: [{
          status: 1,
          result: JSON.stringify([{
            file: "/tmp/professional.wav",
            prompt: request.prompt,
            lyrics: "",
            metas: { bpm: 124, duration: renderDuration, keyscale: "F minor", genres: "Tech House" },
            dit_model: "acestep-v15-xl-sft",
          }]),
        }],
      });
    }
    if (href.includes("/v1/audio?path=")) {
      if (String(init.method || "GET").toUpperCase() === "HEAD") {
        audioHeadRequests += 1;
        return new Response(null, { status: 405 });
      }
      const range = String(init.headers?.Range || init.headers?.range || "");
      const match = range.match(/bytes=(\d+)-(\d+)/);
      const start = match ? Number(match[1]) : 0;
      const end = match ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
      return new Response(wav.subarray(start, end + 1), {
        status: match ? 206 : 200,
        headers: {
          "content-type": "audio/wav",
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${wav.length}`,
          "accept-ranges": "bytes",
        },
      });
    }
    throw new Error(`Unexpected mocked URL: ${href}`);
  };

  try {
    const env = { MODAL_PROXY_KEY: "test-key", MODAL_PROXY_SECRET: "test-secret", ACESTEP_API_URL: "https://engine.test" };
    const startResponse = await sonaraWorker.fetch(new Request("https://api.sonaraenterprise.com/api/engine/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }), env, {});
    assert.equal(startResponse.status, 202);
    const started = await startResponse.json();
    const jobResponse = await sonaraWorker.fetch(new Request(`https://api.sonaraenterprise.com/api/music/job/${started.jobId}`), env, {});
    const completed = await jobResponse.json();
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.metadata.outputQualityGate.status, "PASSED");
    assert.equal(audioHeadRequests, 0, "the official ACE-Step audio endpoint is GET-only");
    assert.equal(completed.metadata.outputQualityGate.audioGate.metrics.sampleRate, 48000);
    assert.equal(completed.metadata.audioFormat, "wav");
    assert.equal(completed.metadata.model, "acestep-v15-xl-sft");
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.caches = previousCaches;
  }
});

test("rejects direct generation when the billing proxy secret is enabled", async () => {
  const response = await sonaraWorker.fetch(new Request("https://api.sonaraenterprise.com/api/engine/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(baseRequest),
  }), {
    SONARA_INTERNAL_PROXY_SECRET: "server-only-secret",
  }, {});

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(payload.error, /authorized billing proxy/i);
});
