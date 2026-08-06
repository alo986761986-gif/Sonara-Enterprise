"""
Sonara Producer AI V3 - Dataset Trainer
Scans the dataset folder hierarchy, compiles acoustic analysis statistics, averages, and benchmark reports.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("SonaraTrainer")

class DatasetTrainer:
    """
    Automated Trainer Engine.
    Scans the dataset directory tree, analyzes analysis.json, prompt.json, and quality.json files,
    computes macro/micro statistics, genre benchmarks, and outputs summary reports.
    """

    def __init__(self, dataset_dir: Optional[str] = None):
        self.dataset_dir = Path(dataset_dir or os.path.join(os.path.dirname(__file__), "..", "dataset")).resolve()
        self.dataset_records: List[Dict[str, Any]] = []

    def scan_dataset(self) -> List[Dict[str, Any]]:
        """
        Recursively scans the dataset directory for subgenre folders containing json metadata.
        """
        logger.info(f"Scanning dataset directory: {self.dataset_dir}")
        self.dataset_records = []

        if not self.dataset_dir.exists():
            logger.error(f"Dataset directory does not exist: {self.dataset_dir}")
            return []

        # Find all analysis.json files in dataset tree
        for analysis_path in self.dataset_dir.glob("**/analysis.json"):
            folder = analysis_path.parent
            prompt_path = folder / "prompt.json"
            quality_path = folder / "quality.json"
            audio_path = folder / "audio.wav"

            try:
                analysis_data = {}
                prompt_data = {}
                quality_data = {}

                if analysis_path.exists():
                    with open(analysis_path, "r", encoding="utf-8") as f:
                        analysis_data = json.load(f)

                if prompt_path.exists():
                    with open(prompt_path, "r", encoding="utf-8") as f:
                        prompt_data = json.load(f)

                if quality_path.exists():
                    with open(quality_path, "r", encoding="utf-8") as f:
                        quality_data = json.load(f)

                subgenre_rel = folder.relative_to(self.dataset_dir).as_posix()
                genre_parts = subgenre_rel.split("/")
                primary_genre = genre_parts[0].capitalize() if genre_parts else "Unknown"
                subgenre_name = genre_parts[-1].replace("_", " ").title() if len(genre_parts) > 1 else primary_genre

                record = {
                    "path": subgenre_rel,
                    "primary_genre": prompt_data.get("genre", primary_genre),
                    "subgenre": prompt_data.get("subgenre", subgenre_name),
                    "prompt": prompt_data.get("prompt", ""),
                    "bpm": analysis_data.get("bpm", prompt_data.get("bpm", 120.0)),
                    "lufs": analysis_data.get("lufs", -12.0),
                    "kick_energy": analysis_data.get("kick_energy", 0.8),
                    "bass_energy": analysis_data.get("bass_energy", 0.8),
                    "stereo_width": analysis_data.get("stereo_width", 0.8),
                    "quality_score": quality_data.get("overall_score", 90),
                    "has_audio_wav": audio_path.exists(),
                    "analysis": analysis_data,
                    "quality": quality_data,
                    "prompt_meta": prompt_data
                }
                self.dataset_records.append(record)
                logger.info(f"Loaded subgenre record: {subgenre_rel} (Score: {record['quality_score']})")

            except Exception as e:
                logger.error(f"Error parsing dataset folder {folder}: {e}")

        logger.info(f"Scan complete. Total subgenre datasets loaded: {len(self.dataset_records)}")
        return self.dataset_records

    def compute_genre_statistics(self) -> Dict[str, Any]:
        """
        Calculates metric averages and genre-level benchmark aggregates.
        """
        if not self.dataset_records:
            self.scan_dataset()

        genre_buckets: Dict[str, List[Dict[str, Any]]] = {}
        for rec in self.dataset_records:
            g = rec["primary_genre"]
            if g not in genre_buckets:
                genre_buckets[g] = []
            genre_buckets[g].append(rec)

        genre_stats: Dict[str, Any] = {}
        for g_name, items in genre_buckets.items():
            count = len(items)
            avg_bpm = sum(i["bpm"] for i in items) / count
            avg_lufs = sum(i["lufs"] for i in items) / count
            avg_kick = sum(i["kick_energy"] for i in items) / count
            avg_bass = sum(i["bass_energy"] for i in items) / count
            avg_stereo = sum(i["stereo_width"] for i in items) / count
            avg_score = sum(i["quality_score"] for i in items) / count

            genre_stats[g_name] = {
                "subgenres_count": count,
                "average_bpm": round(avg_bpm, 1),
                "average_lufs": round(avg_lufs, 1),
                "average_kick_energy": round(avg_kick, 2),
                "average_bass_energy": round(avg_bass, 2),
                "average_stereo_width": round(avg_stereo, 2),
                "average_quality_score": round(avg_score, 1),
                "subgenre_list": [i["subgenre"] for i in items]
            }

        overall_avg_quality = (
            sum(r["quality_score"] for r in self.dataset_records) / len(self.dataset_records)
            if self.dataset_records else 0
        )

        benchmark_report = {
            "total_subgenres_analyzed": len(self.dataset_records),
            "primary_genres_covered": len(genre_stats),
            "global_average_quality_score": round(overall_avg_quality, 1),
            "genre_benchmarks": genre_stats
        }

        return benchmark_report

    def generate_training_report(self, output_path: Optional[str] = None) -> str:
        """
        Generates markdown training report and saves summary JSON benchmark data.
        """
        stats = self.compute_genre_statistics()

        lines = [
            "# Sonara Producer AI V3 - Dataset Training & Benchmark Report",
            "",
            f"**Total Subgenre Datasets Analyzed:** {stats['total_subgenres_analyzed']}",
            f"**Primary Genres Covered:** {stats['primary_genres_covered']}",
            f"**Global Benchmark Quality Score:** {stats['global_average_quality_score']} / 100",
            "",
            "## Genre Benchmark Statistics",
            ""
        ]

        for genre, g_data in stats["genre_benchmarks"].items():
            lines.append(f"### {genre}")
            lines.append(f"- **Subgenres:** {', '.join(g_data['subgenre_list'])}")
            lines.append(f"- **Average Quality Score:** {g_data['average_quality_score']}")
            lines.append(f"- **Average BPM:** {g_data['average_bpm']}")
            lines.append(f"- **Average LUFS:** {g_data['average_lufs']} dB")
            lines.append(f"- **Kick / Bass Energy:** {g_data['average_kick_energy']} / {g_data['average_bass_energy']}")
            lines.append(f"- **Stereo Width:** {g_data['average_stereo_width']}")
            lines.append("")

        report_md = "\n".join(lines)

        if output_path:
            try:
                out_p = Path(output_path)
                out_p.parent.mkdir(parents=True, exist_ok=True)
                with open(out_p, "w", encoding="utf-8") as f:
                    f.write(report_md)
                
                json_path = out_p.with_suffix(".json")
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(stats, f, indent=2)
                
                logger.info(f"Saved training report to {out_p} and {json_path}")
            except Exception as e:
                logger.error(f"Failed writing report file {output_path}: {e}")

        return report_md

if __name__ == "__main__":
    trainer = DatasetTrainer()
    trainer.scan_dataset()
    report = trainer.generate_training_report(output_path="engine/training_report.md")
    print(report)
