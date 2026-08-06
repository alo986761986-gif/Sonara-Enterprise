# SONARA ENTERPRISE V12 - DEPENDENCY POLICY SPECIFICATION

**Document Version:** 3.0.0  
**Effective Date:** August 4, 2026  
**Status:** OFFICIAL ENTERPRISE STANDARD  

---

## 1. OVERVIEW & POLICY GOALS

The Sonara V12 Dependency Policy defines the officially supported hardware, OS, CUDA driver, Python, and Node.js runtime matrices required for deterministic execution of Sonara Enterprise across high-performance GPU clouds (RunPod RTX 4090) and containerized cloud platforms.

---

## 2. OFFICIAL SUPPORTED VERSION MATRIX

### 2.1 Core Infrastructure & Runtimes

| Infrastructure Component | Version Specifier | Constraint Policy | Enforced Check |
| :--- | :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS (Jammy) | Mandatory for GPU production | `lsb_release -a` |
| **Linux Kernel** | `>= 5.15.0-100-generic` | Required for io_uring & GPU Direct | `uname -r` |
| **NVIDIA Driver** | `>= 550.54.14` | CUDA 12.4 Compute Capability | `nvidia-smi` |
| **CUDA Toolkit** | `12.4.1` | Must match PyTorch cu124 wheels | `nvcc --version` |
| **Python Engine** | `3.11.9` | 3.11.x mandatory (3.12+ prohibited due to xformers C-ABI) | `python3 --version` |
| **Node.js Engine** | `20.12.2 LTS` | 20.x mandatory for Cloud Run / Vite | `node --version` |
| **Package Manager (Node)**| `npm 10.5.0` / `Bun 1.1.20`| Lockfile parity enforced | `npm -v` |

---

### 2.2 Deep Learning & Generative AI Libraries

| Library Name | Official Version | CUDA Index / Wheel | Purpose in Sonara V12 |
| :--- | :--- | :--- | :--- |
| **PyTorch (`torch`)** | `2.4.1+cu124` | `https://download.pytorch.org/whl/cu124` | Neural audio inference & training |
| **TorchAudio** | `2.4.1+cu124` | `https://download.pytorch.org/whl/cu124` | DSP resampling, WAV stream decoding |
| **TorchVision** | `0.19.1+cu124` | `https://download.pytorch.org/whl/cu124` | Mel-spectrogram tensor rendering |
| **Transformers** | `4.40.2` | PyPI | MusicGen & Encodec model loading |
| **Diffusers** | `0.28.0` | PyPI | Stable Audio & Riffusion plugins |
| **Accelerate** | `0.30.1` | PyPI | FP16 / BF16 mixed-precision GPU execution |
| **AudioCraft** | `1.3.0` | PyPI / Git | Optional MusicGen plugin (Non-blocking) |
| **xFormers** | `0.0.28.post1` | PyPI (cu124 wheel) | Memory-efficient attention for RTX 4090 |

---

### 2.3 Application & Frontend Stack

| Library Name | Official Version | Policy Notes |
| :--- | :--- | :--- |
| **Express** | `4.19.2` / `5.2.1` | Production Web API Server |
| **Vite** | `5.4.11` / `8.2.0` | High-speed frontend asset bundling |
| **React** | `18.3.1` / `19.2.8` | Component UI state framework |
| **TypeScript** | `5.4.5` | Type-safe enterprise compilation |
| **Cesium** | `1.143.0` | Global spatial music discovery engine |
| **Firebase Admin** | `14.2.0` | Lazy-initialized authentication |

---

## 3. NON-BLOCKING PLUGIN ISOLATION POLICY

Sonara V12 enforces a strict **Graceful Degradation Policy** for external AI model plugins:

1. **Core Engine Primacy:** Sonara AI's native DSP engine, backend API, and core MusicGen pipeline MUST boot cleanly even if zero optional plugins are loaded.
2. **Optional Plugins:** AudioCraft, Stable Audio, Riffusion, and LoRA adapters are flagged as **Optional External Extensions**.
3. **Failure Isolation:** If an optional plugin fails during installation or initialization (e.g., `PLUGIN AUDIOCRAFT FAILED`), the bootstrap procedure logs the exception, updates `installer.json` status to `"OPTIONAL_FAILED"`, and proceeds without interrupting the Sonara core runtime.
