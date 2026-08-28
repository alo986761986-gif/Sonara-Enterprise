import os
import subprocess
import sys
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
WORKER = WORK / 'kaggle-sonara-wan21-video-worker.py'
LOG = WORK / 'sonara_wan21_background_launcher.log'
URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker.py'

print('SONARA WAN Turbo HQ - avvio non bloccante')
print('Download worker aggiornato...')
urllib.request.urlretrieve(URL, WORKER)

log = open(LOG, 'a', buffering=1)
proc = subprocess.Popen(
    [sys.executable, str(WORKER)],
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    env=os.environ.copy(),
)

print(f'OK: worker avviato in background, PID={proc.pid}')
print(f'Log: {LOG}')
print('La cella puo terminare subito; il caricamento CUDA continua in background.')
print('Health locale: http://127.0.0.1:7861/health')
