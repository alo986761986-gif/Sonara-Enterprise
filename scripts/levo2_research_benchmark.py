#!/usr/bin/env python3
import argparse
import csv
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

SUITES = {
    "quick": [
        {
            "id": "deep_house_female_en",
            "genre": "Deep House",
            "mood": "dark, emotional, hypnotic",
            "prompt": "female vocal, professional deep house, deep bass, warm analog synths, atmospheric pads, elegant club mix",
            "lyrics": "[intro-short]; [verse] Lost inside the midnight glow, shadows moving soft and slow; [chorus] Take me deeper through the night, hold me underneath the light; [outro-short]",
            "auto_prompt_audio_type": "Electronic",
            "generate_type": "mixed",
        },
        {
            "id": "tech_house_male_en",
            "genre": "Tech House",
            "mood": "driving, dirty, energetic",
            "prompt": "male vocal, professional tech house, punchy kick, rolling bassline, tight percussion, dry club vocal, peak-time groove",
            "lyrics": "[intro-short]; [verse] Feel the pressure on the floor, one more beat and give me more; [chorus] Move your body, lose control, let the rhythm take your soul; [outro-short]",
            "auto_prompt_audio_type": "Electronic",
            "generate_type": "mixed",
        },
        {
            "id": "pop_female_it",
            "genre": "Pop",
            "mood": "emotional, modern, uplifting",
            "prompt": "female vocal, modern Italian pop, polished radio production, emotional piano, wide synths, strong melodic chorus",
            "lyrics": "[intro-short]; [verse] Cammino ancora dentro questa città, con le tue parole che restano qua; [chorus] Dimmi che ritornerai, anche solo per un attimo, dimmi che mi cercherai; [outro-short]",
            "auto_prompt_audio_type": "Pop",
            "generate_type": "mixed",
        },
        {
            "id": "rap_male_it",
            "genre": "Hip-Hop",
            "mood": "raw, dark, confident",
            "prompt": "male vocal, Italian rap hip-hop, old school drums, deep bass, dark piano loop, confident flow, gritty professional mix",
            "lyrics": "[intro-short]; [verse] Cammino sulla strada con la notte nelle scarpe, sogni nelle tasche e mille segni sulle carte; [chorus] Non mi fermo adesso, tengo stretto ciò che ho, ogni passo lascia il segno, questa vita la vivrò; [outro-short]",
            "auto_prompt_audio_type": "Hip-Hop",
            "generate_type": "mixed",
        },
    ],
    "full": [
        {
            "id": "deep_house_female_en",
            "genre": "Deep House",
            "mood": "dark, emotional, hypnotic",
            "prompt": "female vocal, professional deep house, deep bass, warm analog synths, atmospheric pads, elegant club mix",
            "lyrics": "[intro-short]; [verse] Lost inside the midnight glow, shadows moving soft and slow; [chorus] Take me deeper through the night, hold me underneath the light; [outro-short]",
            "auto_prompt_audio_type": "Electronic",
            "generate_type": "mixed",
        },
        {
            "id": "tech_house_male_en",
            "genre": "Tech House",
            "mood": "driving, dirty, energetic",
            "prompt": "male vocal, professional tech house, punchy kick, rolling bassline, tight percussion, dry club vocal, peak-time groove",
            "lyrics": "[intro-short]; [verse] Feel the pressure on the floor, one more beat and give me more; [chorus] Move your body, lose control, let the rhythm take your soul; [outro-short]",
            "auto_prompt_audio_type": "Electronic",
            "generate_type": "mixed",
        },
        {
            "id": "pop_female_it",
            "genre": "Pop",
            "mood": "emotional, modern, uplifting",
            "prompt": "female vocal, modern Italian pop, polished radio production, emotional piano, wide synths, strong melodic chorus",
            "lyrics": "[intro-short]; [verse] Cammino ancora dentro questa città, con le tue parole che restano qua; [chorus] Dimmi che ritornerai, anche solo per un attimo, dimmi che mi cercherai; [outro-short]",
            "auto_prompt_audio_type": "Pop",
            "generate_type": "mixed",
        },
        {
            "id": "rap_male_it",
            "genre": "Hip-Hop",
            "mood": "raw, dark, confident",
            "prompt": "male vocal, Italian rap hip-hop, old school drums, deep bass, dark piano loop, confident flow, gritty professional mix",
            "lyrics": "[intro-short]; [verse] Cammino sulla strada con la notte nelle scarpe, sogni nelle tasche e mille segni sulle carte; [chorus] Non mi fermo adesso, tengo stretto ciò che ho, ogni passo lascia il segno, questa vita la vivrò; [outro-short]",
            "auto_prompt_audio_type": "Hip-Hop",
            "generate_type": "mixed",
        },
        {
            "id": "rock_male_en",
            "genre": "Rock",
            "mood": "powerful, anthemic, emotional",
            "prompt": "male vocal, modern alternative rock, live drums, distorted guitars, wide chorus, strong bass, polished arena mix",
            "lyrics": "[intro-short]; [verse] I was running from the fire, carrying a broken wire; [chorus] We rise again, we rise tonight, turning every scar to light; [outro-short]",
            "auto_prompt_audio_type": "Rock",
            "generate_type": "mixed",
        },
        {
            "id": "jazz_female_en",
            "genre": "Jazz",
            "mood": "intimate, smoky, elegant",
            "prompt": "female vocal, late-night jazz club, upright bass, brushed drums, warm piano, subtle saxophone, intimate analog recording",
            "lyrics": "[intro-short]; [verse] Moonlight falls across the room, velvet shadows start to bloom; [chorus] Stay with me until the dawn, one more song before you're gone; [outro-short]",
            "auto_prompt_audio_type": "Jazz",
            "generate_type": "mixed",
        },
        {
            "id": "ballad_female_it",
            "genre": "Ballad",
            "mood": "romantic, nostalgic, cinematic",
            "prompt": "female vocal, Italian cinematic ballad, intimate piano, strings, emotional crescendo, pristine studio vocal",
            "lyrics": "[intro-short]; [verse] Ti ritrovo nelle luci della sera, in ogni strada che sembrava più sincera; [chorus] Resta ancora qui con me, anche se domani cambierà, questa notte parlerà di noi; [outro-short]",
            "auto_prompt_audio_type": "Ballad",
            "generate_type": "mixed",
        },
        {
            "id": "soundtrack_instrumental",
            "genre": "Soundtrack",
            "mood": "cinematic, dark, epic",
            "prompt": "cinematic instrumental score, deep orchestral percussion, evolving strings, dark synth textures, dramatic build, film-quality production",
            "lyrics": "",
            "auto_prompt_audio_type": "Soundtrack",
            "generate_type": "bgm",
        },
    ],
}


def http_json(url, method="GET", payload=None, timeout=1800):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def download(url, dest, timeout=120):
    with urllib.request.urlopen(url, timeout=timeout) as res:
        data = res.read()
        content_type = res.headers.get("Content-Type", "")
    ext = ".flac"
    if "wav" in content_type:
        ext = ".wav"
    elif "mpeg" in content_type:
        ext = ".mp3"
    target = dest.with_suffix(ext)
    target.write_bytes(data)
    return target, len(data)


def main():
    parser = argparse.ArgumentParser(description="Sonara LeVo 2 research benchmark")
    parser.add_argument("--api", default="http://127.0.0.1:8022")
    parser.add_argument("--suite", choices=sorted(SUITES), default="quick")
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument("--output", default="/marimo/SONARA-LeVo2-RESEARCH/SONARA-LEVO2-BENCHMARK")
    args = parser.parse_args()

    api = args.api.rstrip("/")
    out = Path(args.output)
    audio_dir = out / "audio"
    out.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)

    health = http_json(api + "/health", timeout=10)
    if not (health.get("ready") is True and health.get("engine") == "LeVo2-v2-large"):
        raise SystemExit("LeVo 2 worker is not READY: " + json.dumps(health, ensure_ascii=False))

    cases = SUITES[args.suite]
    print("=" * 88)
    print("SONARA LEVO 2 RESEARCH BENCHMARK")
    print("API:", api)
    print("SUITE:", args.suite, "| CASES:", len(cases), "| DURATION:", args.duration, "s")
    print("=" * 88)

    results = []
    bench_start = time.time()

    for idx, case in enumerate(cases, 1):
        print(f"\n[{idx}/{len(cases)}] {case['id']} - {case['genre']}")
        payload = {
            "research_only": True,
            "title": "Sonara Benchmark " + case["id"],
            "genre": case["genre"],
            "mood": case["mood"],
            "prompt": case["prompt"],
            "lyrics": case["lyrics"],
            "duration_sec": max(15, min(270, args.duration)),
            "generate_type": case["generate_type"],
            "auto_prompt_audio_type": case["auto_prompt_audio_type"],
        }
        started = time.time()
        row = {
            "id": case["id"],
            "genre": case["genre"],
            "mood": case["mood"],
            "generate_type": case["generate_type"],
            "auto_prompt_audio_type": case["auto_prompt_audio_type"],
            "requested_duration_sec": payload["duration_sec"],
            "status": "error",
            "elapsed_sec": None,
            "bytes": 0,
            "audio_file": "",
            "job_id": "",
            "error": "",
        }
        try:
            result = http_json(api + "/generate", method="POST", payload=payload, timeout=1800)
            row["elapsed_sec"] = round(time.time() - started, 3)
            row["job_id"] = result.get("job_id", "")
            if result.get("status") != "completed":
                raise RuntimeError(json.dumps(result, ensure_ascii=False))
            audio_url = result.get("audio_url")
            if not audio_url:
                raise RuntimeError("audio_url missing")
            full_url = api + audio_url if str(audio_url).startswith("/") else str(audio_url)
            audio_path, byte_count = download(full_url, audio_dir / case["id"])
            row["status"] = "completed"
            row["bytes"] = byte_count
            row["audio_file"] = str(audio_path)
            print(f"  ✅ {row['elapsed_sec']:.1f}s | {byte_count / 1024 / 1024:.2f} MB | {audio_path.name}")
        except Exception as exc:
            row["elapsed_sec"] = row["elapsed_sec"] or round(time.time() - started, 3)
            row["error"] = repr(exc)
            print("  ❌", row["error"])
        results.append(row)
        (out / "benchmark_partial.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    total_elapsed = round(time.time() - bench_start, 3)
    completed = [r for r in results if r["status"] == "completed"]
    failed = [r for r in results if r["status"] != "completed"]
    avg = round(sum(r["elapsed_sec"] for r in completed) / len(completed), 3) if completed else None

    report = {
        "engine": "LeVo2-v2-large",
        "license_mode": "RESEARCH_ONLY",
        "api": api,
        "suite": args.suite,
        "requested_duration_sec": args.duration,
        "cases": len(results),
        "completed": len(completed),
        "failed": len(failed),
        "total_elapsed_sec": total_elapsed,
        "average_generation_sec": avg,
        "results": results,
        "manual_review": {
            "instructions": "Listen to each audio file and score 1-10 for prompt fidelity, vocal quality, musicality, mix quality and structure.",
            "score_fields": ["prompt_fidelity", "vocal_quality", "musicality", "mix_quality", "structure"],
        },
    }

    json_path = out / "benchmark_report.json"
    csv_path = out / "benchmark_report.csv"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    fields = ["id", "genre", "mood", "generate_type", "auto_prompt_audio_type", "requested_duration_sec", "status", "elapsed_sec", "bytes", "audio_file", "job_id", "error"]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)

    print("\n" + "=" * 88)
    print("BENCHMARK COMPLETATO")
    print("COMPLETATI:", len(completed), "/", len(results))
    print("FALLITI:", len(failed))
    print("TEMPO TOTALE:", total_elapsed, "s")
    print("MEDIA GENERAZIONE:", avg, "s" if avg is not None else "")
    print("REPORT JSON:", json_path)
    print("REPORT CSV:", csv_path)
    print("AUDIO:", audio_dir)
    print("=" * 88)


if __name__ == "__main__":
    main()
