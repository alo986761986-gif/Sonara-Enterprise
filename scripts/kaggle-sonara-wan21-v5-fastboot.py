import os
import subprocess
import sys
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
RUNNER = WORK / 'wan-v5.py'
SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v5.py'

# Current Hugging Face high-performance transfer path.
os.environ['HF_XET_HIGH_PERFORMANCE'] = '1'
os.environ.pop('HF_HUB_ENABLE_HF_TRANSFER', None)

# Reuse a Kaggle HF_TOKEN secret automatically when present.
if not os.environ.get('HF_TOKEN'):
    try:
        from kaggle_secrets import UserSecretsClient
        token = UserSecretsClient().get_secret('HF_TOKEN')
        if token:
            os.environ['HF_TOKEN'] = token
            print('HF_TOKEN Kaggle rilevato: download autenticato attivo.')
    except Exception:
        print('HF_TOKEN non presente: continuo con cache locale / accesso pubblico.')

urllib.request.urlretrieve(SOURCE, RUNNER)
print('Avvio SONARA WAN V5 con HF Xet high-performance...')
subprocess.run([sys.executable, str(RUNNER)], check=True, env=os.environ.copy())
