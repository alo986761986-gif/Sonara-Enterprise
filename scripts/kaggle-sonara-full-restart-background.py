import os
import subprocess
import sys
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
RUNNER = WORK / 'sonara-full-restart.py'
LOG = WORK / 'sonara-full-restart.log'
URLS = WORK / 'sonara-kaggle-urls.txt'
SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-full-restart.py'

print('SONARA - riavvio completo GPU0 Musica + GPU1 Video Turbo HQ')
try:
    URLS.unlink()
except FileNotFoundError:
    pass

urllib.request.urlretrieve(SOURCE, RUNNER)
log = open(LOG, 'w', buffering=1)
proc = subprocess.Popen(
    [sys.executable, str(RUNNER)],
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    env=os.environ.copy(),
)

print(f'OK: riavvio completo avviato in background, PID={proc.pid}')
print(f'Log: {LOG}')
print(f'Quando pronti, i nuovi tunnel saranno salvati in: {URLS}')
print('La cella puo terminare subito.')
