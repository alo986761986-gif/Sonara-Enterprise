# SONARA Remix Pro — Musical Coherence V2: attivazione protetta su MoLab

Questa procedura aggiorna SOLO il worker privato Remix Pro V3 sul notebook RTX PRO 6000, senza intervenire su ACE-Step XL Turbo, LM 4B, Cloudflare o sulla coda R2.

**Requisiti:** notebook MoLab RTX PRO 6000 accessibile, ambiente `/marimo/SONARA-REMIX-PRO/.venv` esistente, agente Remix Pro V3 avviato e **inattivo**, sessione Cloudflare Pro disponibile. Se l'agente elabora un brano o ha stato incerto, il programma rifiuta l'aggiornamento. Non forzare il blocco.

## Diagnosi preliminare senza servizi esterni

Prima di installare, la verifica GitHub pubblica potrebbe mostrare `available=false` e `fusionAvailable=false`. In questo caso non arrestare l'agente: esegui nel notebook MoLab questa sola cella **di sola lettura** e condividi il risultato.

```python
def verifica_sonara_remix_pro():
    import hashlib
    from urllib.request import Request, build_opener, ProxyHandler

    commit = "6c4d23c136819182e0d2a488c58c91fbe6abdd3f"
    sha_atteso = "3c0bc2996decbd2db1f869aef84ccb6df536430f"
    url = ("https://raw.githubusercontent.com/alo986761986-gif/"
           "Sonara-Enterprise/" + commit +
           "/molab/diagnose_sonara_remix_quality_v2_readonly.py")
    req = Request(url, headers={"User-Agent": "SONARA-ReadOnly-Diag/1.0"})
    with build_opener(ProxyHandler({})).open(req, timeout=20) as response:
        codice = response.read(200001)
    sha = hashlib.sha1(b"blob " + str(len(codice)).encode("ascii") +
                       b"\0" + codice).hexdigest()
    assert len(codice) < 200000 and sha == sha_atteso, "Diagnosi non verificata"
    exec(compile(codice.decode("utf-8"), "sonara_readonly_diagnostic.py", "exec"),
         {"__name__": "__main__"})

verifica_sonara_remix_pro()
```

La diagnosi non installa nulla, non apre servizi e non genera musica. Se il valore `SONARA_QUALITY_V2_INSTALL_ELIGIBLE` è falso, **non eseguire l'attivatore con --activate**. Prima risolvere l'indisponibilità della GPU/agent.

## Una sola cella da eseguire nel notebook MoLab

```python
def attiva_sonara_remix_qualita_professionale_v2():
    import hashlib
    import subprocess
    import tempfile
    from pathlib import Path
    from urllib.request import Request, build_opener, ProxyHandler

    commit = "86048068cd4b93136a4aabc9a4a2538b455a5155"
    expected_blob = "e1770bf68fcaef7f73268886e08dacbffd8786f9"
    url = (
        "https://raw.githubusercontent.com/alo986761986-gif/"
        "Sonara-Enterprise/" + commit +
        "/molab/activate_sonara_remix_quality_v2.py"
    )
    opener = build_opener(ProxyHandler({}))
    with opener.open(Request(url, headers={"User-Agent": "SONARA-Remix-V2/1.0"}), timeout=35) as response:
        code = response.read(200001)
    assert code and len(code) < 200000, "Attivatore inatteso: nessuna modifica"
    digest = hashlib.sha1(
        b"blob " + str(len(code)).encode("ascii") + b"\0" + code
    ).hexdigest()
    assert digest == expected_blob, "Attivatore alterato: installazione annullata"

    runtime = Path("/marimo/SONARA-REMIX-PRO/.venv/bin/python")
    assert runtime.is_file(), "Ambiente Remix Pro privato assente"
    with tempfile.TemporaryDirectory(prefix="sonara-quality-v2-") as tmp:
        script = Path(tmp) / "activate.py"
        script.write_bytes(code)
        script.chmod(0o600)

        print("=== SONARA REMIX PRO V2 PREFLIGHT ===", flush=True)
        subprocess.run([str(runtime), str(script)], check=True, timeout=120)
        print("=== SONARA REMIX PRO V2 ATTIVAZIONE SICURA ===", flush=True)
        subprocess.run([str(runtime), str(script), "--activate"],
                       check=True, timeout=600)

attiva_sonara_remix_qualita_professionale_v2()
```

Se il preflight segnala `SONARA_PRO_AGENT_IDLE=False`, **non** fermare manualmente l'agente: termina prima il job attivo e lascia che il worker torni a `waiting_for_authorized_job`. Eseguire di nuovo la cella solo dopo aver verificato lo stato.

## Risultati di attivazione attesi

```text
SONARA_QUALITY_INSTALL_RESULT=SUCCESS
PRO_GPU_VERIFIED=True
PRO_AGENT_AUTHENTICATED=True
SONARA_REMIX_QUALITY_V2_AGENT_RUNNING=True
SONARA_V3_GATEWAY_PRESERVED=True
SONARA_MOLAB_MAIN_ACE_STEP_UNTOUCHED=True
SONARA_MAIN_RELAY_UNTOUCHED=True
SONARA_AUDIO_GENERATION_TEST_RUN=False
```

Questi indicatori certificano che il codice aggiornato è installato e che il worker comunica con la GPU e il gateway, **non** che la musica suoni già professionalmente. L'ultimo controllo richiede due brani di cui si possiedono i diritti, un remix reale di 2–5 minuti e l'ascolto delle transizioni, del tema A, del groove B, della dinamica e del master.

I file originali vengono salvati nella directory privata `/marimo/SONARA-REMIX-PRO/backups/musical-coherence-v2-*`. Il programma non stampa token o segreti. Non usare Vercel né l'installatore V3 originale per aggiornare questa versione.
