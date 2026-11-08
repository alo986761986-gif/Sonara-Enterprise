# SONARA Remix Pro — sito ↔ R2 ↔ Demucs ↔ ACE-Step (gated V1)

## Stato reale

Il test GPU Demucs 4.1 + PyTorch CUDA 12.8 è stato completato dall'utente su MoLab
RTX PRO 6000 Blackwell: quattro stem su un segnale sintetico.
Questa integrazione aggiunge una nuova tab SONARA Remix Pro, un'infrastruttura
Cloudflare R2 **privata**, una coda isolata e un agente MoLab separato.

**Non confondere il test GPU con un remix completo su due brani reali.**
I risultati musicali e la qualità della separazione su canzoni devono essere
convalidati dopo un job autentico, con sorgenti autorizzate.

## Sicurezza e rollout

Il nuovo percorso è **spento per impostazione predefinita**. Si attiva soltanto
quando sono tutte vere:
- `SONARA_REMIX_PRO_ENABLED=true` nel Worker Cloudflare;
- `SONARA_REMIX_PRO_BILLING_READY=true` dopo verifica esplicita della
  corretta contabilizzazione e dei limiti del piano di ogni utente;
- `SONARA_R2_RELAY_ENABLED=true`, bucket `SONARA_AUDIO_BUCKET` disponibile;
- heartbeat autenticato di `sonara-remix-pro-r2-agent-v1` con GPU realmente pronta.

Non impostare prematuramente `SONARA_REMIX_PRO_BILLING_READY`: il
sistema esistente controlla l'accesso ai piani, ma l'integrazione Pro deve
ancora superare una verifica completa del consumo e della contabilizzazione.
Non pubblicare una funzione che può generare job costosi senza i relativi
controlli di quota.

Ogni upload browser riutilizza `POST /api/sonara-relay/reference` e la sessione
SONARA nativa. Solo il gateway autenticato può accodare un job Pro. Il Worker
verifica che **entrambi** gli ID appartengano allo stesso proprietario,
siano WAV e non siano scaduti. Le richieste GPU richiedono token
macchina e revisione agente; per scaricare audio sorgente serve anche
il lease del job. I WAV e gli stem finali sono recuperabili
esclusivamente dal proprietario autenticato; non sono URL pubblici.

## Contabilizzazione Remix Pro (PR di revisione, non attiva)

L'integrazione proposta tiene i flag Remix Pro **spenti** finché i test automatici
e il collaudo end-to-end non sono conclusi. Un job Pro di durata N secondi
prenota **3 × N secondi** del piano Studio (analisi delle due sorgenti più
rigenerazione finale): questo moltiplicatore è una **politica proposta** e deve
essere approvato prima del rilascio commerciale.

- Il Worker genera un ID `srpro_*`, chiede una prenotazione atomica
  all'archivio account SONARA tramite endpoint interno firmato e soltanto
  dopo accoda il job in R2.
- La coda rifiuta ID non prenotati e non rende eseguibili job ancora in
  preparazione. Il Worker conferma il consumo con `complete` o rimborsa con
  `fail`, in modo idempotente.
- Dopo tre lease falliti o due ore in coda, l'agente tenta un rimborso prima
  di segnare il job come fallito. Non è un sostituto di una riconciliazione
  programmata quando l'agente è offline.
- Nessuna sessione browser autorizza direttamente modifiche al ledger.
  I job dell'altro utente e i token rimangono privati.

**Limite per il go-live:** Durable Object e R2 non condividono una singola
transazione atomica. Prima di attivare il flag billing, verificare anche
riconciliazione dei job in preparazione, interruzioni tra settlement e
salvataggio R2, e un job reale autorizzato con prova di quota/rimborso.
Non abilitare `SONARA_REMIX_PRO_BILLING_READY` solo sulla base dei test
unitari o del preflight GPU.

## Job indipendente

```text
Pannello Remix Pro (due file WAV)
    -> upload privato delle sorgenti a Cloudflare R2
    -> /api/billing/generate: verifica account/piano
    -> /api/sonara-relay/pro-enqueue: gate Pro + proprietario
    -> /api/sonara-relay/pro-claim: agente GPU dedicato
    -> Demucs htdemucs: 4 stem per ciascuna sorgente
    -> analisi BPM e tonalità (incertezze esplicite)
    -> arrangiamento A voce/armonie + B batteria
    -> una sola generazione ACE-Step cover reale
    -> mastering misurato e report interno
    -> upload master WAV e 4 stem rappresentativi
    -> /api/sonara-relay/pro-job/<jobId>: progresso e ascolto privato
```

Gli stem esposti includono: voce A, batteria B, basso A, altre armonie A.
La durata iniziale per singolo job è 10–120 secondi. BPM incerti
richiedono specifica manuale e il sistema rifiuta allineamenti troppo
distanti e alcune incompatibilità armoniche. L'algoritmo non può
garantire la conservazione melodica né la compatibilità armonica di
ogni combinazione. L'audio originale rimane conservato localmente
soltanto per la durata dell'elaborazione, poi viene eliminato
dalla cartella di lavoro; alcuni stem possono essere conservati
nella cache privata per evitare separazioni ripetute.

## Installazione controllata dell'agente dedicato

Non sostituire, reinstallare o terminare il relay SONARA esistente.
Usa il Python isolato già verificato in
`/marimo/SONARA-REMIX-PRO/.venv/bin/python`. L'agente deve usare
il token privato già presente in `~/.sonara/relay.token` e può lavorare
solo su `api.sonaraenterprise.com` in HTTPS.

Dopo la revisione del commit, prima di avviare l'agente persistente,
eseguire un controllo che **non legge né accoda brani degli utenti**:

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python -u \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py \
  --auth-mode none --preflight
```

Il risultato deve confermare `PRO_GPU_VERIFIED=True`,
`PRO_AGENT_AUTHENTICATED=True`, `PRO_JOBS_CLAIMED=0`. È normale
che `PRO_SITE_GENERATION_AVAILABLE=False` finché la verifica billing
non autorizza l'attivazione del servizio.

Solo dopo la verifica dei permessi e della fatturazione:

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python -u \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py --auth-mode none
```

**Usare `--auth-mode none` soltanto se l'API locale
`127.0.0.1:8001` è già configurata senza autenticazione.**
Se è protetta, omettere quel parametro e usare le credenziali locali
che SONARA gestisce già. Non inserire password o token in comandi,
repository o output del notebook.

L'agente mantiene un lock dedicato, rinnova il lease del job durante
l'inferenza e resta in standby quando la coda Pro è vuota. I log
mostrano solo ID job e classi di errori, mai il contenuto degli audio,
prompt o credenziali.

## Verifiche prima dell'attivazione della funzione

1. I test della coda isolata, della proprietà delle sorgenti, del lease
   esclusivo, dell'accesso privato agli stem e di compatibilità del
   Remix v6 devono passare.
2. La build Vercel deve completarsi con la nuova interfaccia.
3. L'agente deve autenticarsi e comunicare un heartbeat; verificare
   `GET /api/sonara-relay/pro-capabilities`.
4. Verificare le quote e gli addebiti di un job Pro, in particolare
   per un secondo brano e per la rigenerazione finale.
5. Fare un job autorizzato da 10–30 s con due canzoni di prova licenziate
   e misurare realmente suoni e qualità di voce, batteria, basso e master.
6. Solo dopo questa evidenza e gli opportuni controlli economici
   abilitare i flag Pro con deployment e possibilità di rollback.

### Regressioni che devono restare vietate

Non cambiare l'agente `sonara-remix-r2-agent-v6` che gestisce il
Remix classico. Non spostare il suo token in variabili client,
non rendere il bucket pubblico e non utilizzare tunnel esterni.
Non interpretare un heartbeat come prova di qualità musicale.

