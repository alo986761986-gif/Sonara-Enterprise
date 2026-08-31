# Sonara LeVo 2 Research Engine

Status: R&D only. Not enabled for commercial or production traffic.

## License guard

The upstream SongGeneration/LeVo 2 license currently restricts the software and weights to academic, research and education use and prohibits commercial/production use. Sonara therefore keeps this engine isolated behind the research adapter. `LeVo2ResearchEngine` refuses production use unless a future commercial license is explicitly configured with `LEVO2_COMMERCIAL_LICENSE=true`.

## RTX worker

Default research worker URL: `http://127.0.0.1:8012`.

Environment variables:

- `LEVO2_ROOT=/marimo/SONARA-LeVo2-RESEARCH`
- `LEVO2_RESEARCH_PORT=8012`
- `LEVO2_RESEARCH_API_KEY=<optional secret>`
- `LEVO2_RESEARCH_API_URL=http://127.0.0.1:8012`
- `LEVO2_RESEARCH_TIMEOUT_MS=1800000`

Start:

```bash
/marimo/SONARA-LeVo2-RESEARCH/venv/bin/python scripts/levo2_research_worker.py --host 0.0.0.0 --port 8012
```

Health:

```bash
curl http://127.0.0.1:8012/health
```

Node smoke test:

```bash
LEVO2_RESEARCH_API_URL=http://127.0.0.1:8012 node scripts/levo2-research-smoke.mjs
```

Real R&D generation smoke:

```bash
LEVO2_RESEARCH_API_URL=http://127.0.0.1:8012 LEVO2_RUN_GENERATION_SMOKE=1 node scripts/levo2-research-smoke.mjs
```

## Known-good environment observed 2026-08-31

- Python 3.10.20
- PyTorch 2.9.0+cu128
- TorchAudio 2.9.0+cu128
- TorchVision 0.24.0+cu128
- TorchCodec 0.9.0
- setuptools 80.9.0
- Hugging Face Hub 0.25.2
- NumPy 1.26.4
- Flash Attention disabled for the validated path
- RTX PRO 6000 Blackwell, ~96 GB VRAM

The validated LeVo checkout also includes the compatibility patch for `tools/new_auto_prompt.pt` loading with `weights_only=False`, and the Git LFS binary for that file must be materialized rather than left as a pointer.

## Sonara integration contract

The worker exposes:

- `GET /health`
- `POST /generate`
- `GET /audio/<job-path>`

`POST /generate` requires `research_only: true` and serializes GPU generations with a worker lock. The TypeScript adapter is `backend/src/engine/LeVo2ResearchEngine.ts` and follows `IAudioGenerationEngine`.

ACE-Step remains the default production engine. LeVo 2 is a benchmark/R&D provider until licensing changes.
