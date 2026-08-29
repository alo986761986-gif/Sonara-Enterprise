import json, os, platform, re, shutil, signal, subprocess, sys, time, urllib.request
from pathlib import Path

BASE = Path('/marimo/SONARA-ACE-Step-1.5')
WORK = Path('/tmp/sonara-molab-xl-v13'); WORK.mkdir(parents=True, exist_ok=True)
MODEL='acestep-v15-xl-turbo'; PORT=8001
MAP={'loguru':'loguru>=0.7.3','dotenv':'python-dotenv','fastapi':'fastapi>=0.110.0','uvicorn':'uvicorn[standard]>=0.27.0','multipart':'python-multipart>=0.0.18','diskcache':'diskcache','toml':'toml','transformers':'transformers>=4.51.0,<4.58.0','diffusers':'diffusers>=0.37.0','matplotlib':'matplotlib>=3.7.5','scipy':'scipy>=1.10.1','soundfile':'soundfile>=0.13.1','einops':'einops>=0.8.1','accelerate':'accelerate>=1.12.0','numba':'numba>=0.63.1','vector_quantize_pytorch':'vector-quantize-pytorch>=1.27.15','peft':'peft>=0.18.0','lycoris':'lycoris-lora','lightning':'lightning>=2.0.0','tensorboard':'tensorboard>=2.20.0','modelscope':'modelscope','typer':'typer-slim>=0.21.1','pytorch_wavelets':'pytorch-wavelets>=1.3.0','pywt':'pywavelets>=1.9.0','setuptools':'setuptools<72','huggingface_hub':'huggingface-hub','safetensors':'safetensors','yaml':'PyYAML','PIL':'pillow','librosa':'librosa','aiofiles':'aiofiles','sentencepiece':'sentencepiece','tiktoken':'tiktoken','omegaconf':'omegaconf'}
GPU={'torch','torchvision','torchaudio','torchcodec','torchao','flash_attn','flash_attn_4','triton'}

def sh(cmd, **kw):
    print('$ '+' '.join(map(str,cmd)), flush=True)
    p=subprocess.run(cmd,capture_output=True,text=True,**kw)
    if p.returncode:
        raise RuntimeError((p.stdout or '')+'\n'+(p.stderr or ''))
    return p

def find_root():
    if not BASE.exists(): raise RuntimeError(f'Cartella assente: {BASE}')
    direct=BASE/'acestep'/'api_server.py'
    if direct.exists(): return BASE
    hits=list(BASE.rglob('acestep/api_server.py'))
    if not hits: raise RuntimeError('Non trovo acestep/api_server.py dentro '+str(BASE))
    return hits[0].parent.parent

def choose_python(root):
    candidates=[]
    for x in ['/marimo/.venv/bin/python','/tmp/uv-venv/bin/python',sys.executable,'/usr/local/bin/python3.12','/usr/bin/python3.12']:
        if x and Path(x).exists() and x not in candidates: candidates.append(x)
    env=os.environ.copy(); env['PYTHONPATH']=str(root)+os.pathsep+str(root/'acestep/third_parts/nano-vllm')+os.pathsep+env.get('PYTHONPATH','')
    for py in candidates:
        p=subprocess.run([py,'-c','import torch; print(torch.cuda.is_available())'],env=env,capture_output=True,text=True)
        if p.returncode==0 and p.stdout.strip().endswith('True'):
            print('PYTHON CUDA:',py,flush=True); return py,env
    raise RuntimeError('Nessun Python con CUDA trovato')

def repair(py,env,root):
    uv=shutil.which('uv') or '/usr/local/bin/uv'
    for n in range(30):
        p=subprocess.run([py,'-c','import loguru,torch,fastapi,uvicorn; import acestep.api_server; print("OK"); print("CUDA="+str(torch.cuda.is_available()))'],cwd=str(root),env=env,capture_output=True,text=True)
        if p.returncode==0:
            print(p.stdout.strip(),flush=True); return
        txt=(p.stdout or '')+'\n'+(p.stderr or '')
        m=re.search(r"ModuleNotFoundError: No module named ['\"]([^'\"]+)['\"]",txt)
        if not m: raise RuntimeError('Import ACE-Step fallito:\n'+txt[-14000:])
        mod=m.group(1).split('.')[0]
        if mod in GPU: raise RuntimeError('Dipendenza GPU critica mancante: '+mod+'\n'+txt[-8000:])
        pkg=MAP.get(mod,mod)
        print(f'AUTO-REPAIR {n+1}: {mod} -> {pkg}',flush=True)
        sh([uv,'pip','install','--python',py,pkg],cwd=str(root),env=env,timeout=1800)
    raise RuntimeError('Troppe dipendenze mancanti')

def get_json(url,timeout=15):
    req=urllib.request.Request(url,headers={'Accept':'application/json','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        raw=r.read().decode('utf-8','replace'); return json.loads(raw) if raw else {}

def ready(b):
    d=b.get('data') or b if isinstance(b,dict) else {}
    return isinstance(d,dict) and str(d.get('status','')).lower()=='ok' and d.get('models_initialized') is True and MODEL in str(d.get('loaded_model',''))

def kill_old():
    try: rows=subprocess.check_output(['ps','-eo','pid=,args='],text=True)
    except Exception: return
    for row in rows.splitlines():
        parts=row.strip().split(maxsplit=1)
        if len(parts)!=2: continue
        try: pid=int(parts[0])
        except: continue
        cmd=parts[1].lower()
        if ('acestep.api_server' in cmd and '8001' in cmd) or ('cloudflared' in cmd and '8001' in cmd):
            try: os.kill(pid,signal.SIGTERM)
            except: pass
    time.sleep(2)

def start_api(py,env,root):
    env=env.copy(); env.update({'ACESTEP_CONFIG_PATH':MODEL,'ACESTEP_DEVICE':'cuda','ACESTEP_INIT_LLM':'false','ACESTEP_USE_FLASH_ATTENTION':'false','ACESTEP_OFFLOAD_TO_CPU':'false','ACESTEP_OFFLOAD_DIT_TO_CPU':'false','ACESTEP_LM_OFFLOAD_TO_CPU':'false','ACESTEP_NO_INIT':'false','ACESTEP_API_HOST':'0.0.0.0','ACESTEP_API_PORT':str(PORT),'ACESTEP_API_WORKERS':'1','ACESTEP_QUEUE_WORKERS':'1','ACESTEP_QUEUE_MAXSIZE':'64','ACESTEP_DOWNLOAD_SOURCE':'huggingface','TOKENIZERS_PARALLELISM':'false','MPLBACKEND':'Agg','PYTHONUNBUFFERED':'1','PYTORCH_CUDA_ALLOC_CONF':'expandable_segments:True'})
    logp=WORK/'api.log'; log=open(logp,'w',buffering=1)
    p=subprocess.Popen([py,'-m','acestep.api_server','--host','0.0.0.0','--port',str(PORT),'--download-source','huggingface'],cwd=str(root),env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    print('API PID=',p.pid,flush=True)
    end=time.time()+1200
    while time.time()<end:
        if p.poll() is not None: raise RuntimeError('API terminata:\n'+(logp.read_text(errors='ignore')[-24000:] if logp.exists() else ''))
        try:
            b=get_json(f'http://127.0.0.1:{PORT}/health')
            if ready(b): print('ACE-Step API + XL-Turbo PRONTI',flush=True); return p,b
        except: pass
        time.sleep(3)
    raise RuntimeError('Timeout XL-Turbo:\n'+(logp.read_text(errors='ignore')[-24000:] if logp.exists() else ''))

def cf_bin():
    for c in [Path('/tmp/cloudflared'),WORK/'cloudflared']:
        if c.exists() and os.access(c,os.X_OK): return c
    arch='arm64' if platform.machine().lower() in {'arm64','aarch64'} else 'amd64'; c=WORK/'cloudflared'
    urllib.request.urlretrieve(f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}',c); c.chmod(0o755); return c

def start_cf():
    logp=WORK/'cloudflare.log'; log=open(logp,'w',buffering=1); c=cf_bin()
    p=subprocess.Popen([str(c),'tunnel','--no-autoupdate','--url',f'http://127.0.0.1:{PORT}'],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    pat=re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com',re.I); end=time.time()+180
    while time.time()<end:
        if p.poll() is not None: raise RuntimeError('Tunnel terminato:\n'+(logp.read_text(errors='ignore')[-12000:] if logp.exists() else ''))
        txt=logp.read_text(errors='ignore') if logp.exists() else ''; m=pat.search(txt)
        if m: return p,m.group(0).rstrip('/')
        time.sleep(1)
    raise RuntimeError('Nessun URL Cloudflare')

def main():
    print('='*76); print(' SONARA MOLAB XL-TURBO V13 - SOURCE MODE (NO PIP -e) '); print('='*76)
    root=find_root(); print('ACE ROOT=',root,flush=True)
    py,env=choose_python(root); repair(py,env,root); kill_old(); api,local=start_api(py,env,root); cf,url=start_cf()
    end=time.time()+180; pub=None
    while time.time()<end:
        try:
            pub=get_json(url+'/health',20)
            if ready(pub): break
        except Exception: pass
        time.sleep(2)
    if not ready(pub or {}): raise RuntimeError('Tunnel pubblico non pronto: '+repr(pub))
    print('\n'+'='*76); print(' ✅ SONARA MOLAB XL-TURBO PRONTO '); print('='*76)
    print('SONARA_MOLAB_XL_URL='+url); print('MODEL='+MODEL); print('LOCAL_PORT='+str(PORT)); print('PUBLIC_HEALTH='+json.dumps(pub,ensure_ascii=False)[:1800]); print('='*76); print('NON FERMARE QUESTA CELLA.',flush=True)
    while True:
        if api.poll() is not None: raise RuntimeError('API fermata: '+str(WORK/'api.log'))
        if cf.poll() is not None: raise RuntimeError('Tunnel fermato: '+str(WORK/'cloudflare.log'))
        time.sleep(30)

if __name__=='__main__': main()
