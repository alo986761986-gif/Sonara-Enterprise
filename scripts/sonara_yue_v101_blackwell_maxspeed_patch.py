#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

INFER = Path('/marimo/YuE-quality/inference/infer.py')
BACKUP = Path('/marimo/YuE-quality/inference/infer.py.before-v101-maxspeed')
MARKER = '# SONARA_V101_BLACKWELL_MAXSPEED'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'✅ {label}: gia applicato', flush=True)
        return text
    if old not in text:
        raise RuntimeError(f'Pattern non trovato per {label}')
    print(f'✅ {label}: applicato', flush=True)
    return text.replace(old, new, 1)


def main():
    print('=' * 80)
    print('SONARA YUE V10.1 BLACKWELL MAX SPEED PATCH')
    print('=' * 80)
    if not INFER.exists():
        raise RuntimeError(f'infer.py non trovato: {INFER}')

    text = INFER.read_text(encoding='utf-8')
    if not BACKUP.exists():
        BACKUP.write_text(text, encoding='utf-8')
        print('✅ Backup creato:', BACKUP, flush=True)

    if MARKER not in text:
        text = MARKER + '\n' + text

    old_seed = '''    torch.backends.cudnn.deterministic = True\n    torch.backends.cudnn.benchmark = False'''
    new_seed = '''    if os.environ.get("SONARA_YUE_MAX_SPEED", "0") == "1":\n        torch.backends.cudnn.deterministic = False\n        torch.backends.cudnn.benchmark = True\n        torch.set_float32_matmul_precision("high")\n        try:\n            torch.backends.cuda.matmul.allow_tf32 = True\n        except Exception:\n            pass\n        try:\n            torch.backends.cudnn.allow_tf32 = True\n        except Exception:\n            pass\n    else:\n        torch.backends.cudnn.deterministic = True\n        torch.backends.cudnn.benchmark = False'''
    if new_seed not in text:
        if old_seed not in text:
            raise RuntimeError('Blocco cuDNN seed non trovato')
        text = text.replace(old_seed, new_seed, 1)
        print('✅ cuDNN benchmark + TF32 disponibili in MAX SPEED', flush=True)
    else:
        print('✅ cuDNN MAX SPEED gia applicato', flush=True)

    old_c1 = '''if torch.__version__ >= "2.0.0":\n    model = torch.compile(model)'''
    new_c1 = '''if torch.__version__ >= "2.0.0" and os.environ.get("SONARA_YUE_TORCH_COMPILE", "0") == "1":\n    model = torch.compile(model, mode="reduce-overhead")'''
    if old_c1 in text:
        text = text.replace(old_c1, new_c1, 1)
        print('✅ Stage1: compile per-job disattivabile', flush=True)
    elif new_c1 in text:
        print('✅ Stage1 compile patch gia presente', flush=True)
    else:
        raise RuntimeError('Blocco torch.compile Stage1 non trovato')

    old_c2 = '''if torch.__version__ >= "2.0.0":\n    model_stage2 = torch.compile(model_stage2)'''
    new_c2 = '''if torch.__version__ >= "2.0.0" and os.environ.get("SONARA_YUE_TORCH_COMPILE", "0") == "1":\n    model_stage2 = torch.compile(model_stage2, mode="reduce-overhead")'''
    if old_c2 in text:
        text = text.replace(old_c2, new_c2, 1)
        print('✅ Stage2: compile per-job disattivabile', flush=True)
    elif new_c2 in text:
        print('✅ Stage2 compile patch gia presente', flush=True)
    else:
        raise RuntimeError('Blocco torch.compile Stage2 non trovato')

    INFER.write_text(text, encoding='utf-8')

    # Syntax-only validation: does not load weights.
    import py_compile
    py_compile.compile(str(INFER), doraise=True)

    print('=' * 80)
    print('✅ V10.1 BLACKWELL MAX SPEED PATCH PRONTA')
    print('✅ torch.compile PER OGNI BRANO: OFF')
    print('✅ cuDNN benchmark: ON in MAX SPEED')
    print('✅ TF32 path: ON dove applicabile')
    print('✅ BF16 models: INVARIATI')
    print('✅ decoding YuE: INVARIATO')
    print('=' * 80)


if __name__ == '__main__':
    main()
