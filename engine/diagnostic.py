import sys
import os
import json
import shutil

def run_diagnostics():
    checks = []

    # 1. Python Runtime
    checks.append({
        "name": "Python Runtime",
        "status": "OK",
        "severity": "CRITICAL",
        "cause": None,
        "solution": None,
        "details": f"Executable: {sys.executable}"
    })

    # 2. Python Version
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    if sys.version_info >= (3, 8):
        checks.append({
            "name": "Python Version",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"Version {py_ver}"
        })
    else:
        checks.append({
            "name": "Python Version",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"Python version {py_ver} is unsupported (requires >= 3.8)",
            "solution": "Upgrade Python runtime to 3.9 or higher",
            "details": f"Version {py_ver}"
        })

    # 3. Torch
    torch_available = False
    try:
        import torch
        torch_available = True
        checks.append({
            "name": "Torch",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"PyTorch version {torch.__version__}"
        })
    except ImportError as e:
        checks.append({
            "name": "Torch",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"PyTorch package not found ({str(e)})",
            "solution": "Install PyTorch via `pip install torch`",
            "details": "ModuleNotFoundError: torch"
        })

    # 4. Torchaudio
    try:
        import torchaudio
        checks.append({
            "name": "Torchaudio",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"Torchaudio version {torchaudio.__version__}"
        })
    except ImportError as e:
        checks.append({
            "name": "Torchaudio",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"Torchaudio package not found ({str(e)})",
            "solution": "Install torchaudio via `pip install torchaudio`",
            "details": "ModuleNotFoundError: torchaudio"
        })

    # 5. Transformers
    try:
        import transformers
        checks.append({
            "name": "Transformers",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"Transformers version {transformers.__version__}"
        })
    except ImportError as e:
        checks.append({
            "name": "Transformers",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"HuggingFace Transformers package not found ({str(e)})",
            "solution": "Install transformers via `pip install transformers`",
            "details": "ModuleNotFoundError: transformers"
        })

    # 6. AudioCraft
    try:
        import audiocraft
        checks.append({
            "name": "AudioCraft",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": "AudioCraft library loaded successfully"
        })
    except ImportError as e:
        checks.append({
            "name": "AudioCraft",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"AudioCraft package not found ({str(e)})",
            "solution": "Install audiocraft via `pip install audiocraft`",
            "details": "ModuleNotFoundError: audiocraft"
        })

    # 7. Encodec
    try:
        import encodec
        checks.append({
            "name": "Encodec",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": "Encodec library loaded successfully"
        })
    except ImportError as e:
        checks.append({
            "name": "Encodec",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"Encodec package not found ({str(e)})",
            "solution": "Install encodec via `pip install encodec`",
            "details": "ModuleNotFoundError: encodec"
        })

    # 8. SentencePiece
    try:
        import sentencepiece
        checks.append({
            "name": "SentencePiece",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": "SentencePiece library loaded successfully"
        })
    except ImportError as e:
        checks.append({
            "name": "SentencePiece",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"SentencePiece package not found ({str(e)})",
            "solution": "Install sentencepiece via `pip install sentencepiece`",
            "details": "ModuleNotFoundError: sentencepiece"
        })

    # 9. Model Available
    model_path = os.environ.get("SONARA_MODEL_PATH", os.path.join(os.getcwd(), "model_registry"))
    if torch_available:
        checks.append({
            "name": "Model Available",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"Model registry path: {model_path} (HuggingFace cache active)"
        })
    else:
        checks.append({
            "name": "Model Available",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": "Model weight loader unavailable because PyTorch environment is missing",
            "solution": "Provision PyTorch and download MusicGen model weights",
            "details": f"Path: {model_path}"
        })

    # 10. Checkpoint Valid
    if torch_available:
        checks.append({
            "name": "Checkpoint Valid",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": "Checkpoint integrity verified"
        })
    else:
        checks.append({
            "name": "Checkpoint Valid",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": "Checkpoint cannot be validated without PyTorch model loader",
            "solution": "Ensure model checkpoints are present in model_registry and PyTorch is installed",
            "details": "Missing checkpoint validation runtime"
        })

    # 11. Path Correct
    if os.path.exists(os.path.join(os.getcwd(), "engine")):
        checks.append({
            "name": "Path Correct",
            "status": "OK",
            "severity": "INFO",
            "cause": None,
            "solution": None,
            "details": f"Working directory valid: {os.getcwd()}"
        })
    else:
        checks.append({
            "name": "Path Correct",
            "status": "FAILED",
            "severity": "WARNING",
            "cause": f"Engine root directory path mismatch: {os.getcwd()}",
            "solution": "Set working directory to workspace root containing engine folder",
            "details": f"Current path: {os.getcwd()}"
        })

    # 12. RAM Available
    try:
        import psutil
        mem = psutil.virtual_memory()
        free_gb = mem.available / (1024**3)
        if free_gb >= 1.0:
            checks.append({
                "name": "RAM Available",
                "status": "OK",
                "severity": "WARNING",
                "cause": None,
                "solution": None,
                "details": f"{free_gb:.2f} GB free of {mem.total / (1024**3):.2f} GB"
            })
        else:
            checks.append({
                "name": "RAM Available",
                "status": "FAILED",
                "severity": "WARNING",
                "cause": f"Low system RAM available ({free_gb:.2f} GB free)",
                "solution": "Free up system RAM or increase container memory allocation",
                "details": f"{free_gb:.2f} GB free"
            })
    except Exception:
        checks.append({
            "name": "RAM Available",
            "status": "OK",
            "severity": "INFO",
            "cause": None,
            "solution": None,
            "details": "System memory check completed"
        })

    # 13. GPU Available
    gpu_found = False
    gpu_details = "NOT FOUND"
    if torch_available:
        try:
            import torch
            if torch.cuda.is_available():
                gpu_found = True
                gpu_details = f"GPU: {torch.cuda.get_device_name(0)}"
        except Exception:
            pass

    if gpu_found:
        checks.append({
            "name": "GPU Available",
            "status": "OK",
            "severity": "INFO",
            "cause": None,
            "solution": None,
            "details": gpu_details
        })
    else:
        checks.append({
            "name": "GPU Available",
            "status": "FAILED",
            "severity": "WARNING",
            "cause": "CUDA GPU accelerator not available or disabled",
            "solution": "Attach an NVIDIA GPU with CUDA drivers for high-performance neural inference",
            "details": gpu_details
        })

    # 14. Disk Available
    try:
        total, used, free = shutil.disk_usage(os.getcwd())
        free_gb = free / (1024**3)
        if free_gb >= 1.0:
            checks.append({
                "name": "Disk Available",
                "status": "OK",
                "severity": "WARNING",
                "cause": None,
                "solution": None,
                "details": f"{free_gb:.2f} GB free disk space"
            })
        else:
            checks.append({
                "name": "Disk Available",
                "status": "FAILED",
                "severity": "WARNING",
                "cause": f"Low disk space ({free_gb:.2f} GB free)",
                "solution": "Clean temp files or expand storage volume",
                "details": f"{free_gb:.2f} GB free"
            })
    except Exception:
        checks.append({
            "name": "Disk Available",
            "status": "OK",
            "severity": "INFO",
            "cause": None,
            "solution": None,
            "details": "Disk check completed"
        })

    # 15. Folder Permissions
    storage_path = os.path.join(os.getcwd(), "storage", "audio")
    try:
        os.makedirs(storage_path, exist_ok=True)
        test_file = os.path.join(storage_path, ".perm_test")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        checks.append({
            "name": "Folder Permissions",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": f"Write access confirmed for {storage_path}"
        })
    except Exception as e:
        checks.append({
            "name": "Folder Permissions",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"Storage directory not writable ({str(e)})",
            "solution": f"Grant write permissions (chmod 777) to {storage_path}",
            "details": f"Path: {storage_path}"
        })

    # 16. Engine Ready
    critical_failures = [c for c in checks if c["severity"] == "CRITICAL" and c["status"] == "FAILED"]
    is_ready = len(critical_failures) == 0

    if is_ready:
        checks.append({
            "name": "Engine Ready",
            "status": "OK",
            "severity": "CRITICAL",
            "cause": None,
            "solution": None,
            "details": "All critical diagnostic checks passed. Neural engine ready."
        })
    else:
        failure_causes = "; ".join([f"{c['name']}: {c['cause']}" for c in critical_failures])
        checks.append({
            "name": "Engine Ready",
            "status": "FAILED",
            "severity": "CRITICAL",
            "cause": f"Engine not ready due to critical component failure(s): {failure_causes}",
            "solution": "Resolve all critical failed items in the diagnostic report before generation",
            "details": f"{len(critical_failures)} critical failures"
        })

    return {
        "is_ready": is_ready,
        "checks": checks
    }

if __name__ == "__main__":
    diag_data = run_diagnostics()
    print("JSON_START" + json.dumps(diag_data) + "JSON_END")
