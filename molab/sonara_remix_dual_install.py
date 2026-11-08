"""Pinned, isolated Remix Pro update; leaves ACE-Step and main relay untouched."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request
import uuid

ROOT = Path('/marimo/SONARA-REMIX-PRO')
PRIVATE = Path.home() / '.sonara'
REV = '6e583631ea42f04184a266d44994fb8d1fcc06ea'
FILES = {
    'sonara_remix_pro_toolkit.py': '0468ec39d55753b790fdd29726d63bcbac4754b2',
    'sonara_remix_pro_r2_agent.py': '7fbc4c061e432a52464a2e084bc9d500a46f18f9',
    'sonara_remix_pro_live_qa.py': 'acb7209d79319533772236348b34d92d03e3b746',
}


def agent_processes():
    found = []
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():
            continue
        try:
            args = [x.decode() for x in (p/'cmdline').read_bytes().split(b'\0') if x]
            if str(ROOT/'sonara_remix_pro_r2_agent.py') in args:
                found.append((int(p.name), args))
        except (OSError, UnicodeError):
            continue
    return found


def lock_owner_is(pid, lock):
    st = os.fstat(lock.fileno())
    for line in Path('/proc/locks').read_text().splitlines():
        fields = line.split()
        if len(fields) < 6 or fields[1] != 'FLOCK':
            continue
        device = fields[5].split(':')
        if len(device) == 3 and (int(device[0],16),int(device[1],16),int(device[2])) == (os.major(st.st_dev),os.minor(st.st_dev),st.st_ino):
            return fields[4] == str(pid)
    return False


def main():
    print('SONARA_UPDATE=DUAL_SOURCE_V1', flush=True)
    py = ROOT/'.venv/bin/python'
    agent = ROOT/'sonara_remix_pro_r2_agent.py'
    state = PRIVATE/'remix-pro-agent-status.json'
    if not py.is_file() or not agent.is_file():
        raise RuntimeError('INSTALLAZIONE_PRO_ASSENTE')
    guard = (PRIVATE/'remix-dual-install.lock').open('a+')
    os.chmod(guard.name, 0o600)
    fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
    processes = agent_processes()
    if len(processes) != 1:
        raise RuntimeError('PROCESSO_PRO_NON_UNIVOCO_NESSUNA_MODIFICA')
    pid, args = processes[0]
    if '--once' in args or '--preflight' in args:
        raise RuntimeError('PROCESSO_PRO_NON_CONTINUO')
    mode = 'required'
    for i, arg in enumerate(args):
        if arg == '--auth-mode':
            mode = args[i+1]
        elif arg.startswith('--auth-mode='):
            mode = arg.split('=',1)[1]
    if mode not in ('none','required'):
        raise RuntimeError('MODALITA_API_NON_VERIFICATA')
    # A pidfd cannot signal an unrelated process after PID reuse.
    pidfd = os.pidfd_open(pid)
    lock = (PRIVATE/'remix-pro-agent.lock').open('a+')
    if not lock_owner_is(pid, lock) or (pid,args) not in agent_processes():
        raise RuntimeError('LOCK_PRO_NON_VERIFICATO_NESSUNA_MODIFICA')
    old = agent.read_text()
    if 'signal.signal(signal.SIGTERM,stop_handler)' not in old or 'STOP=True' not in old:
        raise RuntimeError('ARRESTO_GRADUALE_NON_VERIFICATO')
    work = ROOT/('dual-update-'+uuid.uuid4().hex)
    work.mkdir(mode=0o700)
    backup = work/'backup'
    backup.mkdir(mode=0o700)
    for name, expected in FILES.items():
        url = f'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/{REV}/molab/{name}'
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read(200001)
        digest = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if digest != expected:
            raise RuntimeError('HASH_DOWNLOAD_NON_VALIDO')
        compile(data, name, 'exec')
        (work/name).write_bytes(data)
        target = ROOT/name
        if target.is_symlink():
            raise RuntimeError('FILE_PRO_SIMBOLICO_NON_SUPPORTATO')
        if target.exists():
            (backup/name).write_bytes(target.read_bytes())
    check = subprocess.run([str(py),'-c',
        'import sys; sys.path.insert(0,sys.argv[1]); import sonara_remix_pro_toolkit as t; '
        't._deps(); assert callable(t.add_generated_percussion)',str(work)],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if check.returncode:
        raise RuntimeError('DIPENDENZE_PRO_NON_PRONTE_NESSUNA_MODIFICA')
    if not lock_owner_is(pid, lock):
        raise RuntimeError('PROCESSO_CAMBIATO_NESSUNA_MODIFICA')
    print('DOWNLOAD_E_IMPORT_VERIFICATI=True',flush=True)
    print('ATTENDO_FINE_EVENTUALE_JOB_PRO=True',flush=True)
    signal.pidfd_send_signal(pidfd, signal.SIGTERM)
    # Existing handler lets the current job finish; never SIGKILL a render.
    deadline = time.monotonic()+1800
    last_message = 0
    while True:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic()>deadline:
                raise RuntimeError('JOB_ANCORA_ATTIVO_FILE_NON_MODIFICATI')
            if time.monotonic()-last_message > 30:
                print('ATTESA_RILASCIO_LOCK_PRO=True',flush=True)
                last_message=time.monotonic()
            time.sleep(2)
    command=[str(py),'-u',str(agent),'--auth-mode',mode]
    log_path=ROOT/'sonara-remix-pro-agent.log'
    def start():
        with log_path.open('ab') as log:
            return subprocess.Popen(command,cwd=str(ROOT),stdin=subprocess.DEVNULL,
                                    stdout=log,stderr=log,start_new_session=True)
    changed=[]
    try:
        for name in FILES:
            os.replace(work/name,ROOT/name)
            changed.append(name)
    except Exception:
        for name in changed:
            saved=backup/name
            if saved.exists():
                os.replace(saved,ROOT/name)
            else:
                (ROOT/name).unlink(missing_ok=True)
        fcntl.flock(lock,fcntl.LOCK_UN)
        start()
        raise RuntimeError('SCRITTURA_FALLITA_ORIGINALI_RIPRISTINATI') from None
    fcntl.flock(lock,fcntl.LOCK_UN)
    started=time.time()
    try:
        child=start()
    except OSError:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        for name in changed:
            saved=backup/name
            if saved.exists():
                os.replace(saved,ROOT/name)
            else:
                (ROOT/name).unlink(missing_ok=True)
        fcntl.flock(lock,fcntl.LOCK_UN)
        start()
        raise RuntimeError('AVVIO_FALLITO_ORIGINALI_RIPRISTINATI') from None
    for _ in range(45):
        if child.poll() is not None:
            # Roll back only while exclusively holding the agent lock.
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            for name in changed:
                saved=backup/name
                if saved.exists():
                    os.replace(saved,ROOT/name)
                else:
                    (ROOT/name).unlink(missing_ok=True)
            fcntl.flock(lock,fcntl.LOCK_UN)
            restored=start()
            print('ROLLBACK_AVVIATO_PID='+str(restored.pid),flush=True)
            raise RuntimeError('NUOVO_AGENTE_TERMINATO_ORIGINALI_RIPRISTINATI')
        try:
            data=json.loads(state.read_text())
            if state.stat().st_mtime >= started and lock_owner_is(child.pid,lock):
                current=data.get('state')
                if current=='waiting_for_authorized_job':
                    print('CORREZIONE_DUE_BRANI_INSTALLATA=True',flush=True)
                    print('PRO_AGENT_PID='+str(child.pid),flush=True)
                    print('PRO_STATO='+current,flush=True)
                    print('BACKUP='+str(backup),flush=True)
                    print('ACE_STEP_E_RELAY_PRINCIPALE_INVARIATI=True',flush=True)
                    print('REMIX_REALE_DA_VERIFICARE_CON_DUE_BRANI=True',flush=True)
                    return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    print('FILE_AGGIORNATI=True',flush=True)
    print('PRO_AGENT_PID='+str(child.pid),flush=True)
    print('AVVIO_NON_ANCORA_CONFERMATO_NON_RIESEGUIRE=True',flush=True)
    print('BACKUP='+str(backup),flush=True)


if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print('AGGIORNAMENTO_INTERROTTO='+type(error).__name__,flush=True)
        if isinstance(error,RuntimeError):
            print('MOTIVO='+str(error),flush=True)
        raise SystemExit(1)
