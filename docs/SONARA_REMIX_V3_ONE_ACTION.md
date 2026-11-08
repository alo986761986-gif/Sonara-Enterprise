# SONARA — Attiva insieme agente GPU V3 e fusione creativa A+B

Cloudflare has been published, but a GitHub workflow cannot execute code in the private MoLab RTX PRO 6000 notebook. The only remaining dependency for real V3 availability is the **dedicated MoLab Remix Pro worker**. It must be launched within its authenticated GPU runtime.

## Una sola cella MoLab

Apri il notebook RTX PRO 6000 già avviato e incolla questo blocco in una **nuova cella** di Marimo. Fai Run una volta. Non occorre inserire password, token né due brani. Non esegue alcuna generazione musicale di prova. Il codice e il relativo hash sono fissati a un commit GitHub immutabile:

```python
def avvia_sonara_remix_pro_v3_ab():
    import hashlib
    import subprocess
    import tempfile
    from pathlib import Path
    from urllib.request import urlopen

    versione = "3bdf2f396d48dbd0385fb3c1ad048eac77a61379"
    blob_verificato = "77cd4a5c1ed91f660688c58c8e9d67d7ada27b1d"
    url = (
        "https://raw.githubusercontent.com/alo986761986-gif/"
        "Sonara-Enterprise/" + versione +
        "/molab/activate_sonara_remix_pro_v3.py"
    )
    with urlopen(url, timeout=35) as risposta:
        codice = risposta.read(200000)
    hash_git = hashlib.sha1(
        b"blob " + str(len(codice)).encode() + b"\0" + codice
    ).hexdigest()
    assert hash_git == blob_verificato, "File modificato: installazione annullata"
    with tempfile.TemporaryDirectory(prefix="sonara-remix-v3-") as cartella:
        script = Path(cartella) / "attivazione.py"
        script.write_bytes(codice)
        script.chmod(0o600)
        subprocess.run(
            ["/marimo/SONARA-REMIX-PRO/.venv/bin/python",
             str(script), "--activate"],
            check=True, timeout=420,
        )

avvia_sonara_remix_pro_v3_ab()
```

This is not a new deployment to Vercel, nor a new tunnel. The script downloads four pinned files, refuses installation during active Remix Pro work, gracefully hands off only an explicitly idle isolated Pro V2 process, retains backups, checks real RTX GPU/authenticated Cloudflare heartbeat, launches V3, then checks `fusionAvailable=true`. It never modifies the main ACE-Step service, main SONARA relay, Cloudflare settings, or billing controls. It does not execute an A+B audio generation.

### Risultato corretto da condividere

```text
SONARA_PRO_GPU_V3=ONLINE
SONARA_CREATIVE_FUSION_A_B=ACTIVE_FOR_AUTHORIZED_JOBS
SONARA_CLOUDFLARE_FUSION_AVAILABLE=True
SONARA_ACE_STEP_MAIN_UNCHANGED=True
SONARA_MAIN_RELAY_UNCHANGED=True
SONARA_AUDIO_GENERATION_TEST_RUN=False
```

If the script refuses to start because the agent V2 is busy or the API credential is missing, **do not bypass the lock or kill the live process**. Only the isolated worker is handled. The site checks `/api/sonara-relay/pro-capabilities` every 10 seconds and enables Remix Pro when the genuine V3 GPU heartbeat is verified.

**Important:** A successful readiness signal certifies that the V3 agent is online, *not* that generated music has been auditioned or artistically verified.

## Correzione del blocco «Dedicated Pro worker is not confirmed idle»

Se il gateway Cloudflare V3 rifiuta una richiesta `pro-claim` proveniente dal vecchio agente V2, il vecchio agente registra `connection_unavailable`, anche quando non sta producendo alcuna canzone. La versione precedente dell'attivatore considerava inattivi solo gli stati `waiting_for_authorized_job` e `waiting_for_pro_activation`: da qui il blocco.

La versione corretta, adesso fissata ai nuovi hash, consente la transizione **solo** con revisione V2 esatta, stato recente, assenza di `jobId` e verifica della stessa condizione una seconda volta dopo due secondi. Se rileva una generazione in corso, stato vecchio, revisione sconosciuta o più agenti Pro, non invia alcun segnale. Se il vecchio agente è confermato inattivo, usa solo SIGTERM per il suo processo dedicato; non usa mai SIGKILL.

L'aggiornamento si applica eseguendo nuovamente **questa cella aggiornata**; il vecchio blocco incollato nella precedente cella contiene invece il commit vecchio e riproduce l'errore. Il file Python principale ACE-Step, il relay SONARA e il sito non sono toccati.
