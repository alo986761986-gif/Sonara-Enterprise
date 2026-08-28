import subprocess
import sys
import urllib.request
from pathlib import Path

# Immutable source of the original V10 implementation. This loader hotfixes the
# patching bug before execution, so main can never recursively download itself.
BASE_V10 = (
    'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
    'ddf757edb1a223cfcbcf63889d80464ca548dbb7/'
    'scripts/kaggle-sonara-wan21-video-worker-v10.py'
)
TARGET = Path('/kaggle/working/sonara-wan-v10-fixed-launcher.py')

request = urllib.request.Request(BASE_V10, headers={'User-Agent': 'SONARA-WAN-V10-Hotfix/1.0'})
with urllib.request.urlopen(request, timeout=60) as response:
    source = response.read().decode('utf-8')

# Root cause fixed: the old unindented anchor matched the text inside
# "def enable_cache(candidate):" and generated "def # V10 HQ...".
old_cache_patch = '''    ("enable_cache(candidate)", "# V10 HQ: disable approximate feature caching to preserve exact denoising quality.\\n            cache_enabled = False\\n            cache_error = 'disabled-for-hq-exact-denoise'"),'''
new_cache_patch = '''    ("            enable_cache(candidate)", "            # V10 HQ: disable approximate feature caching to preserve exact denoising quality.\\n            cache_enabled = False\\n            cache_error = 'disabled-for-hq-exact-denoise'"),'''
if old_cache_patch not in source:
    raise RuntimeError('SONARA V10 hotfix: cache patch anchor non trovato nel sorgente V10.')
source = source.replace(old_cache_patch, new_cache_patch, 1)

# Add a second safety layer: after V10 has generated the actual FastAPI app.py,
# compile that file before Uvicorn is started. A malformed generated app now
# fails immediately with the real syntax error instead of silently leaving 7861 closed.
loop_anchor = '''for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V10 patch anchor not found: {old[:110]!r}')
    source = source.replace(old, new, 1)

'''
preflight_block = '''for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V10 patch anchor not found: {old[:110]!r}')
    source = source.replace(old, new, 1)

app_write_anchor = "    APP.write_text(APP_CODE, encoding='utf-8')\\n    stop_gpu1_worker()"
app_write_replacement = "    APP.write_text(APP_CODE, encoding='utf-8')\\n    subprocess.run([sys.executable, '-m', 'py_compile', str(APP)], check=True)\\n    stop_gpu1_worker()"
if app_write_anchor not in source:
    raise RuntimeError('V10 preflight anchor APP.write_text non trovato.')
source = source.replace(app_write_anchor, app_write_replacement, 1)

'''
if loop_anchor not in source:
    raise RuntimeError('SONARA V10 hotfix: loop di patch non trovato.')
source = source.replace(loop_anchor, preflight_block, 1)

TARGET.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, '-m', 'py_compile', str(TARGET)], check=True)
print('SONARA WAN V10 HOTFIX pronta: cache anchor corretto + app.py preflight attivo.')
subprocess.run([sys.executable, str(TARGET)], check=True)
