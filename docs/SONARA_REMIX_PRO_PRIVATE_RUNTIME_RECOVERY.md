# SONARA Remix Pro - recupero ambiente isolato RTX PRO 6000

Diagnosi locale: GPU RTX PRO 6000 SM120 riconosciuta, moduli Remix Pro presenti, ma mancano il runtime Python privato, il file di autenticazione relay e l'agente GPU. Cloudflare risponde HTTP 200 e attende un heartbeat V3. Non occorre reinstallare ACE-Step XL Turbo.

## Ripristino controllato senza TinyFish o Vercel

Aprire MoLab RTX PRO 6000 e aggiungere una cella Python con questo codice:

~~~python
def recupera_runtime_remix_pro():
    import hashlib
    import urllib.request

    commit = "fe28a3580c661dd67a88a160470dc8d22e05b223"
    expected = "2ac2d44b7ae8b86c5bd31d376a00678b064cb2c1"
    url = (
        "https://raw.githubusercontent.com/alo986761986-gif/"
        "Sonara-Enterprise/" + commit +
        "/molab/recover_sonara_remix_pro_private_runtime.py"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "SONARA-Recovery/1.0"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=35) as res:
        data = res.read(200001)
    sha = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
    assert data and len(data) <= 200000 and sha == expected, "File GitHub non verificato"
    ctx = {"__name__": "sonara_recovery_import"}
    exec(compile(data.decode("utf-8"), "sonara_recovery.py", "exec"), ctx)
    main = ctx["main"]
    main([])
    main(["--recover-venv"])
    authorized, candidate, _ = ctx["candidates"]()
    if not authorized and candidate is not None:
        main(["--restore-known-token"])
    else:
        print("SONARA_PAIRING_REQUIRED=" + str(not authorized))

recupera_runtime_remix_pro()
~~~

Il codice verifica un commit e hash GitHub immutabili prima di eseguire il ripristino. Ricrea soltanto la directory privata /marimo/SONARA-REMIX-PRO/.venv tramite uv e Python 3.12, installa librerie compatibili CUDA 12.8, Demucs 4.1 e librerie audio, ed esegue i controlli GPU SM120. Si arresta se la GPU non corrisponde, se è presente un agente dedicato, se lo spazio è insufficiente o se la venv esistente è incompleta.

La credenziale di autenticazione viene copiata solo da percorsi privati conosciuti e solo se la sua impronta SHA256 corrisponde a una credenziale autorizzata nel repository. Non crea, non stampa e non inventa token. Se SONARA_PAIRING_REQUIRED=True sarà necessario ripristinare il pairing con Cloudflare prima di avviare il worker.

Il ripristino non avvia l'agente, non crea job e non modifica ACE-Step, LM 4B, R2, Cloudflare o il sito. Dopo il ripristino eseguire preflight autenticato e attivazione Musical Coherence V2 sul worker GPU soltanto quando le condizioni sono sicure.
