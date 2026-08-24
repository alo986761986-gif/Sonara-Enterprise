import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRequest,
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
  assert.equal(result.qualityGate.status, "PASSED");
});

test("forwards the final prompt without hidden rewriting", () => {
  const normalized = normalizeRequest(baseRequest);

  assert.equal(normalized.payload.prompt, baseRequest.prompt);
  assert.equal(normalized.generationSpec.rawPrompt, baseRequest.rawPrompt);
  assert.equal(normalized.generationSpec.subgenre, "Tech House");
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
