"""
Sonara Producer AI V3 - LoRA Manifest Generator Engine
Generates full training & validation dataset manifests for LoRA fine-tuning:
1. manifest.jsonl
2. metadata.csv
3. training.json
4. validation.json
5. token_mapping.json
"""

import os
import json
import csv
import logging
from pathlib import Path
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("LoraManifestGenerator")


class LoraManifestGenerator:
    """
    Export Engine for LoRA Fine-Tuning Bundles across Gold, Platinum, and Diamond Tiers.
    """

    def __init__(self, dataset_base_dir: str = None, lora_export_dir: str = None):
        self.dataset_dir = Path(dataset_base_dir or os.path.join(os.path.dirname(__file__), "..", "dataset")).resolve()
        self.lora_dir = Path(lora_export_dir or os.path.join(os.path.dirname(__file__), "..", "lora")).resolve()
        self.lora_dir.mkdir(parents=True, exist_ok=True)

    def generate_full_lora_dataset_bundle(self, min_score: int = 90, val_split_ratio: float = 0.15) -> Dict[str, Any]:
        """
        Scans dataset and builds the 5 required LoRA files:
        1. manifest.jsonl
        2. metadata.csv
        3. training.json
        4. validation.json
        5. token_mapping.json
        """
        logger.info(f"Generating LoRA Training Dataset Bundle (Min Score: {min_score}, Val Split: {val_split_ratio})...")

        all_entries: List[Dict[str, Any]] = []

        for meta_path in self.dataset_dir.rglob("metadata.json"):
            folder = meta_path.parent
            p_path = folder / "prompt.json"
            q_path = folder / "quality.json"
            a_path = folder / "audio.wav"

            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                
                score = meta.get("quality_score", 90)
                if q_path.exists():
                    with open(q_path, "r", encoding="utf-8") as f:
                        q_data = json.load(f)
                        score = q_data.get("overall_score", score)

                if score >= min_score:
                    prompt = meta.get("prompt", "")
                    if p_path.exists():
                        with open(p_path, "r", encoding="utf-8") as f:
                            p_data = json.load(f)
                            prompt = p_data.get("composed_prompt", p_data.get("prompt", prompt))

                    entry = {
                        "id": meta.get("id", folder.name),
                        "audio_path": str(a_path.resolve()),
                        "prompt": prompt,
                        "genre": meta.get("genre", "house"),
                        "subgenre": meta.get("subgenre", "deep_house"),
                        "quality_score": score,
                        "bpm": meta.get("bpm", 124.0),
                        "key": meta.get("key", "A Minor"),
                        "seed": meta.get("seed", 42)
                    }
                    all_entries.append(entry)
            except Exception as e:
                logger.error(f"Error parsing {meta_path} for LoRA export: {e}")

        # Split training / validation
        num_val = max(1, int(len(all_entries) * val_split_ratio)) if len(all_entries) > 0 else 0
        val_entries = all_entries[:num_val]
        train_entries = all_entries[num_val:]

        # 1. manifest.jsonl
        manifest_path = self.lora_dir / "manifest.jsonl"
        with open(manifest_path, "w", encoding="utf-8") as f:
            for item in all_entries:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

        # 2. metadata.csv
        csv_path = self.lora_dir / "metadata.csv"
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["id", "audio_path", "prompt", "genre", "subgenre", "quality_score", "bpm", "key", "seed"])
            for item in all_entries:
                writer.writerow([
                    item["id"], item["audio_path"], item["prompt"], item["genre"],
                    item["subgenre"], item["quality_score"], item["bpm"], item["key"], item["seed"]
                ])

        # 3. training.json
        train_path = self.lora_dir / "training.json"
        with open(train_path, "w", encoding="utf-8") as f:
            json.dump({"dataset_type": "LORA_TRAIN", "total_samples": len(train_entries), "samples": train_entries}, f, indent=2, ensure_ascii=False)

        # 4. validation.json
        val_path = self.lora_dir / "validation.json"
        with open(val_path, "w", encoding="utf-8") as f:
            json.dump({"dataset_type": "LORA_VALIDATION", "total_samples": len(val_entries), "samples": val_entries}, f, indent=2, ensure_ascii=False)

        # 5. token_mapping.json
        token_map_path = self.lora_dir / "token_mapping.json"
        token_data = {
            "version": "Sonara V3 LoRA Token System",
            "global_tokens": [
                "<SONARA_V3>",
                "<HIGH_FIDELITY_90PLUS>",
                "<STEREO_WIDE>",
                "<SIDECHAIN_DUCKED>"
            ],
            "genre_tokens": {
                "house": "<GENRE_HOUSE>",
                "techno": "<GENRE_TECHNO>",
                "edm": "<GENRE_EDM>",
                "trap": "<GENRE_TRAP>",
                "pop": "<GENRE_POP>",
                "rock": "<GENRE_ROCK>",
                "cinematic": "<GENRE_CINEMATIC>",
                "ambient": "<GENRE_AMBIENT>"
            }
        }
        with open(token_map_path, "w", encoding="utf-8") as f:
            json.dump(token_data, f, indent=2, ensure_ascii=False)

        summary = {
            "status": "LORA_MANIFEST_SUCCESS",
            "min_score": min_score,
            "total_samples": len(all_entries),
            "training_samples": len(train_entries),
            "validation_samples": len(val_entries),
            "file_paths": {
                "manifest_jsonl": str(manifest_path),
                "metadata_csv": str(csv_path),
                "training_json": str(train_path),
                "validation_json": str(val_path),
                "token_mapping_json": str(token_map_path)
            }
        }

        logger.info(f"LoRA Manifest Generator complete: {summary}")
        return summary


if __name__ == "__main__":
    gen = LoraManifestGenerator()
    res = gen.generate_full_lora_dataset_bundle()
    print(json.dumps(res, indent=2))
