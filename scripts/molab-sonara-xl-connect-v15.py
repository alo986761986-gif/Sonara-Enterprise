import shutil
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-1.5')
LOADER = ROOT / 'acestep/core/generation/handler/init_service_loader.py'
COMPONENTS = ROOT / 'acestep/core/generation/handler/init_service_loader_components.py'
V14 = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v14.py'


def patch_file(path: Path, old: str, new: str, label: str):
    if not path.exists():
        raise RuntimeError(f'File non trovato: {path}')
    text = path.read_text(encoding='utf-8')
    if new in text:
        print(f'{label}: patch gia presente', flush=True)
        return
    if old not in text:
        raise RuntimeError(f'{label}: blocco originale non trovato, non applico patch alla cieca')
    backup = path.with_suffix(path.suffix + '.sonara-v15.bak')
    if not backup.exists():
        shutil.copy2(path, backup)
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{label}: PATCH OK', flush=True)


def main():
    print('=' * 78)
    print(' SONARA MOLAB XL V15 - FIX META TENSOR DEFINITIVO ')
    print('=' * 78)

    patch_file(
        LOADER,
        '''                self.model = AutoModel.from_pretrained(\n                    model_checkpoint_path,\n                    trust_remote_code=True,\n                    attn_implementation=candidate,\n                    dtype=self.dtype,\n                )''',
        '''                self.model = AutoModel.from_pretrained(\n                    model_checkpoint_path,\n                    trust_remote_code=True,\n                    attn_implementation=candidate,\n                    dtype=self.dtype,\n                    low_cpu_mem_usage=False,\n                    _fast_init=False,\n                    device_map={"": device},\n                )''',
        'MAIN XL MODEL',
    )

    patch_file(
        COMPONENTS,
        '''        self.vae = AutoencoderOobleck.from_pretrained(vae_checkpoint_path)''',
        '''        vae_device = device if not self.offload_to_cpu else "cpu"\n        self.vae = AutoencoderOobleck.from_pretrained(\n            vae_checkpoint_path,\n            device_map={"": vae_device},\n        )''',
        'VAE',
    )

    patch_file(
        COMPONENTS,
        '''        self.text_encoder = AutoModel.from_pretrained(text_encoder_path)''',
        '''        text_encoder_device = device if not self.offload_to_cpu else "cpu"\n        self.text_encoder = AutoModel.from_pretrained(\n            text_encoder_path,\n            low_cpu_mem_usage=False,\n            _fast_init=False,\n            device_map={"": text_encoder_device},\n        )''',
        'TEXT ENCODER',
    )

    print('Patch meta-tensor completata. Avvio stack GPU + ACE-Step XL...', flush=True)
    code = urllib.request.urlopen(V14, timeout=60).read().decode('utf-8')
    exec(compile(code, V14, 'exec'), {'__name__': '__main__', '__file__': V14})


if __name__ == '__main__':
    main()
