# SONARA ENTERPRISE V12 - MULTI-ENVIRONMENT INSTALLATION MATRIX

**Document Version:** 3.0.0  
**Target Environments:** RunPod, Ubuntu, Docker, Cloud Run, Kubernetes, Windows, macOS  

---

## 1. COMPATIBILITY OVERVIEW MATRIX

| Environment / Platform | Hardware Tier | Support Level | Acceleration Backend | Install Method | Certification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RunPod RTX 4090** | 24GB VRAM, 16 vCPU | **TIER 1 (GOLD STANDARD)**| NVIDIA CUDA 12.4 | `bootstrap.py` / `01-07 scripts` | **100% CERTIFIED** |
| **Ubuntu 22.04 Bare Metal**| NVIDIA RTX / A100 / H100 | **TIER 1 (ENTERPRISE)** | NVIDIA CUDA 12.4 | `bootstrap.py` | **100% CERTIFIED** |
| **Docker (NVIDIA Toolkit)**| Any NVIDIA GPU Container | **TIER 1 (CONTAINER)** | CUDA Container Toolkit | `docker compose up` | **100% CERTIFIED** |
| **Google Cloud Run** | Serverless CPU / GPU | **TIER 2 (CLOUD WEB)** | CPU / Web Fallback | Cloud Build / Dockerfile | **100% CERTIFIED** |
| **Kubernetes (K8s GPU)** | K8s Cluster + GPU Operator | **TIER 1 (HELM / K8S)**| NVIDIA GPU Operator | Helm Chart / K8s Manifest | **100% CERTIFIED** |
| **Windows 11 (WSL2)** | RTX 3080/4080/4090 WSL2 | **TIER 2 (DEVELOPER)** | CUDA WSL2 Passthrough | WSL2 Ubuntu 22.04 | **FULLY SUPPORTED** |
| **macOS (Apple Silicon)** | M1 / M2 / M3 Max (32GB+) | **TIER 3 (DEVELOPER)** | Apple MPS (Metal) | Native Python 3.11 + MPS | **SUPPORTED (FALLBACK)**|

---

## 2. DETAILED PLATFORM RUNTIME SPECIFICATIONS

### 1. RunPod RTX 4090 (Primary Gold Environment)
* **OS:** Ubuntu 22.04 LTS (PyTorch 2.4 / CUDA 12.4 pod template)
* **GPU VRAM:** 24,564 MB GDDR6X
* **System RAM:** 32GB - 64GB
* **Inference Speed:** ~1.8 seconds per 30-second audio track
* **Plugin Support:** 100% Full Support (MusicGen, AudioCraft, Stable Audio, Riffusion)

### 2. Ubuntu 22.04 LTS Bare Metal / Cloud Instance (AWS / GCP / Azure)
* **OS:** Standard Ubuntu 22.04 Server
* **Drivers:** NVIDIA Driver 550.54.14 + CUDA Toolkit 12.4
* **System Prerequisite Script:** `01_system.sh` installs `build-essential`, `ffmpeg`, `cmake`, `ninja-build`

### 3. Docker Container Runtime
* **Base Image:** `nvidia/cuda:12.4.1-devel-ubuntu22.04`
* **NVIDIA Runtime:** `--gpus all` via NVIDIA Container Toolkit
* **Multi-Stage Build:** Stage 1 system packages & Node 20 frontend build; Stage 2 Python 3.11 wheel setup & server boot.

### 4. Google Cloud Run Container
* **Architecture:** Full-stack Express + Vite bundle (`dist/server.cjs`)
* **Port Ingress:** Standardized Port 3000
* **API Key Guarding:** Gemini API key & secrets fetched server-side via `@google-cloud/secret-manager`

### 5. Kubernetes Cluster
* **Operator:** NVIDIA GPU Operator v24.3.0
* **Ingress:** NUBE / NGINX Ingress Controller routing HTTP traffic to Node 3000
* **Autoscaling:** HPA scaling based on GPU VRAM usage and HTTP request queues.

### 6. Windows 11 (WSL2)
* **Prerequisite:** WSL2 enabled with Ubuntu 22.04 distribution.
* **Driver:** Host Windows NVIDIA Driver with WSL2 CUDA Passthrough.

### 7. macOS (Apple Silicon M1/M2/M3)
* **PyTorch Backend:** `torch.device("mps")` (Metal Performance Shaders)
* **Note:** AudioCraft plugin automatically falls back to CPU if C++ xformers extensions are unavailable on Darwin arm64.
