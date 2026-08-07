import sys
import os
import json

def audit_environment():
    results = {
        "virtual_env": False,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "python_version_ok": sys.version_info >= (3, 8),
        "python_binary": sys.executable,
        "packages": {},
        "missing_packages": [],
        "checkpoint_status": "UNKNOWN",
        "install_required": False
    }

    # Check if running within dedicated virtual environment
    is_venv = (
        "python_env" in sys.executable or
        "venv" in sys.executable or
        hasattr(sys, "real_prefix") or
        (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix)
    )
    results["virtual_env"] = is_venv

    required_packages = [
        "torch",
        "torchaudio",
        "torchvision",
        "transformers",
        "audiocraft",
        "demucs",
        "encodec",
        "sentencepiece",
        "huggingface_hub",
        "numpy",
        "scipy",
        "soundfile",
        "ffmpeg",
        "tqdm",
        "safetensors",
        "xformers"
    ]

    for pkg in required_packages:
        try:
            if pkg == "ffmpeg":
                import ffmpeg
                results["packages"][pkg] = {"status": "OK", "version": getattr(ffmpeg, "__version__", "installed")}
            else:
                mod = __import__(pkg)
                results["packages"][pkg] = {"status": "OK", "version": getattr(mod, "__version__", "installed")}
        except ImportError:
            results["packages"][pkg] = {"status": "MISSING", "version": None}
            # xformers is optional if incompatible, but standard neural stack packages trigger missing
            if pkg != "xformers":
                results["missing_packages"].append(pkg)

    if results["missing_packages"]:
        results["install_required"] = True

    # Check model checkpoints in registry
    model_dir = os.environ.get("SONARA_MODEL_PATH", os.path.join(os.getcwd(), "model_registry"))
    if os.path.exists(model_dir):
        results["checkpoint_status"] = "REGISTRY_EXISTS"
    else:
        results["checkpoint_status"] = "CACHE_DEFAULT"

    return results

if __name__ == "__main__":
    audit = audit_environment()
    
    print("====================================")
    print("   SONARA PYTHON ENVIRONMENT AUDIT  ")
    print("====================================")
    print(f"Python Binary:    {audit['python_binary']}")
    print(f"VirtualEnv:       {'ACTIVE' if audit['virtual_env'] else 'INACTIVE'}")
    print(f"Python Version:   {audit['python_version']} ({'OK' if audit['python_version_ok'] else 'UNSUPPORTED'})")
    print("------------------------------------")
    print("PACKAGE STATUS:")
    for pkg, info in audit["packages"].items():
        print(f"  {pkg.padEnd(16, '.') if hasattr(pkg, 'padEnd') else pkg + '.'*(16-len(pkg))} {info['status']}")
    print("------------------------------------")
    if audit["install_required"]:
        print(f"Status: INSTALL REQUIRED (Missing: {', '.join(audit['missing_packages'])})")
    else:
        print("Status: ENVIRONMENT ENTERPRISE READY")
    print("====================================")

    print("JSON_START" + json.dumps(audit) + "JSON_END")
