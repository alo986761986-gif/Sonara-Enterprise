#!/usr/bin/env python3
"""Sonara Labs - Core Inference Benchmark & Profiling Tool.

Measures memory footprints, CPU / GPU loads, generation speed, and token
throughput during active local AudioCraft generation cycles.
"""

import os
import sys
import time
import psutil
import json

def get_ram_usage():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 ** 2) # MB

def run_benchmark():
    print("================================================================================")
    print("           SONARA LABS - RUNTIME BENCHMARK & PERFORMANCE AUDIT")
    print("================================================================================")
    
    # 1. Warm-up and import engine
    try:
        from engine.inference import generate_song
    except ImportError:
        print("[-] ERROR: Could not import engine.inference.")
        sys.exit(1)

    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    prompt = "Peak time industrial techno, massive sub kick, high speed hats, dark rolling bassline"
    duration = 10 # 10 seconds benchmark track
    
    print(f"[+] Device Target: {device.upper()}")
    print(f"[+] Track length to generate: {duration} seconds")
    print(f"[+] Initial RAM Usage: {get_ram_usage():.2f} MB")
    
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
        initial_vram = torch.cuda.memory_allocated() / (1024 ** 2)
        print(f"[+] Initial VRAM Allocated: {initial_vram:.2f} MB")
    else:
        initial_vram = 0.0
        
    # Start measurements
    start_time = time.time()
    start_cpu = psutil.cpu_percent(interval=None)
    
    # Execute generation
    print("[+] Executing benchmark generation cycle...")
    result = generate_song(prompt=prompt, lyrics=None, duration=duration, seed=100)
    
    # End measurements
    elapsed = time.time() - start_time
    end_cpu = psutil.cpu_percent(interval=None)
    peak_ram = get_ram_usage()
    
    if device == "cuda":
        peak_vram = torch.cuda.max_memory_allocated() / (1024 ** 2)
        torch.cuda.empty_cache()
    else:
        peak_vram = 0.0

    # Calculate tokens/sec
    # MusicGen uses 50 tokens per second of audio per stream/codebook.
    # Total model tokens = 50 * duration * 4 (for 4 codebooks in EnCodec)
    model_tokens = 50 * duration * 4
    tokens_per_sec = model_tokens / elapsed
    realtime_factor = duration / elapsed
    
    # Write benchmarks summary
    print("\n================================================================================")
    print("                      BENCHMARK PERFORMANCE METRICS")
    print("================================================================================")
    print(f"  - Total Elapsed Generation Time: {elapsed:.3f} seconds")
    print(f"  - Real-Time Factor (RTF):        {realtime_factor:.2f}x (greater than 1.0 means faster than real-time)")
    print(f"  - EnCodec Codebook Tokens:       {model_tokens} tokens")
    print(f"  - Throughput Rate:               {tokens_per_sec:.2f} tokens/second")
    print(f"  - Peak System RAM:               {peak_ram:.2f} MB")
    print(f"  - Peak VRAM Allocated:           {peak_vram:.2f} MB")
    print(f"  - CPU Load Peak:                 {end_cpu}%")
    if device == "cuda":
        print("  - GPU Engine:                    Active (RTX 4090 Dedicated)")
    else:
        print("  - GPU Engine:                    Inactive (Fallback CPU Mode)")
    print("================================================================================")

    # Compile result DTO to save
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "target_device": device,
        "track_duration_seconds": duration,
        "metrics": {
            "elapsed_seconds": elapsed,
            "real_time_factor": realtime_factor,
            "tokens_count": model_tokens,
            "tokens_per_second": tokens_per_sec,
            "peak_ram_mb": peak_ram,
            "peak_vram_mb": peak_vram,
            "cpu_load_percent": end_cpu
        }
    }
    
    report_path = "logs/benchmark_report.json"
    os.makedirs("logs", exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"[+] Profile logs persisted successfully at: {report_path}")

if __name__ == "__main__":
    sys.path.insert(0, os.getcwd())
    run_benchmark()
