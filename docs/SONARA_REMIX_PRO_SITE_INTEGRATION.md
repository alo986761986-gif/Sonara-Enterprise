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
- Il Durable Object pianifica alarm ogni cinque minuti per ricontrollare
  prenotazioni aperte: PREPARING oltre dieci minuti, QUEUED oltre due ore,
  lease esauriti e job oltre quattro ore. Prima scrive FAILED in R2 con
  precondizione ETag; solo dopo tenta il rimborso idempotente.
- Per i job terminali in R2 (COMPLETE/FAILED) l'alarm completa il settlement
  contabile se l'agente si è interrotto tra i due salvataggi.
- Se il job audio è già terminale e la contabilizzazione non risponde,
  l'API restituisce `202` con `ok:true` e `settlementPending:true`:
  l'agente non deve convertire un master WAV completato in un fallimento.
  Il registro viene poi riconciliato dall'alarm.
- Una risposta d'errore dall'accodamento non implica che l'operazione R2
  sia fallita: il gateway non rimborsa immediatamente, conserva l'ID del job
  e il sito lo riprende per permettere la riconciliazione.
- La scansione dei job usa paginazione limitata a 500 marker per allarme
  e riprende le rimanenti prenotazioni nell'allarme successivo.
- Il recupero è best-effort e non costituisce una transazione distribuita.
  Bucket R2 non disponibile, stati ambigui e conflitti ETag restano
  prenotati e devono essere ritentati senza rimborsi alla cieca.
- Nessuna sessione browser autorizza direttamente modifiche al ledger.
  I job dell'altro utente e i token rimangono privati.

**Limite per il go-live:** Durable Object e R2 non condividono una singola
transazione atomica. I test di alarm automatizzati coprono stati terminali,
PREPARING orfani e lease scaduti, ma è ancora indispensabile un collaudo
end-to-end su Worker reale con interruzioni forzate, ETag concorrenti,
storage temporaneamente non disponibile e almeno un job musicale reale
autorizzato, con prova di quota e rimborso.
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



## Collaudo reale GPU A+B, isolato dalla coda e dal billing

Il runner `molab/sonara_remix_pro_live_qa.py` esegue un **vero** test end-to-end,
senza ricorrere a finti WAV o job: separazione Demucs delle due sorgenti,
un'unica traccia arrangiata A+B, un task cover ACE-Step sulla API locale
già esistente, mastering misurato e audit WAV. Non avvia né riavvia ACE-Step,
non scrive nel bucket R2 e non consuma quote utente sul sito.

Eseguirlo solo in MoLab, nell'ambiente indipendente
`/marimo/SONARA-REMIX-PRO/.venv`, dopo aver collocato **due WAV reali con
licenza/autorizzazione** sotto `/marimo`. I path reali devono essere passati
dall'operatore; nessun audio dimostrativo viene generato o scaricato.

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_live_qa.py \
  --source-a /marimo/INPUT_A_AUTORIZZATO.wav \
  --source-b /marimo/INPUT_B_AUTORIZZATO.wav \
  --rights-confirmed \
  --prompt "Fuse the authentic melodic identity of A with the natural groove of B into one coherent remix" \
  --bpm-a 120 --bpm-b 122 \
  --duration 30 --auth-mode required
```

La conferma dei diritti, la presenza delle sorgenti, la venv isolata e
l'autenticazione locale sono obbligatorie. L'output è salvato in una
nuova sottocartella privata `private-local-qa/qa_*` con `mastered.wav`
e `qa-report.json` (nessuna sovrascrittura). Il risultato
`SONARA_QA_AUDIO_TECHNICAL_PASS=True` prova soltanto che il file supera
i controlli numerici; **non prova la qualità artistica o l'effettiva
somiglianza/compatibilità delle sorgenti**. Verificare ascoltando voce,
batteria, armonie, transizioni e artefatti prima dell'approvazione.

Non attivare `SONARA_REMIX_PRO_ENABLED` o
`SONARA_REMIX_PRO_BILLING_READY` prima dell'approvazione della politica
di consumo, del test reale e della verifica del sito.


## Aggiornamento sorgenti lunghe e durata Remix AI (PR #76)

Il modulo Remix Pro permette di **scegliere da 30 a 480 secondi**
(con incrementi da 30 secondi) per un singolo remix A+B.
La durata del remix NON deve essere confusa con la durata di ingresso:
**ciascuna sorgente WAV puo durare fino a 15 minuti**, anche piu di 8 minuti.

- Upload breve <= 80 MiB: endpoint reference tradizionale.
- Upload lungo fino a 512 MiB: R2 multipart autenticato con blocchi da 8 MiB,
  verifica della sessione proprietaria, dimensioni, struttura WAV PCM/float,
  durata fino a 900 secondi. Tutte le parti restano in R2 privato.
- Output e stem > 80 MiB: multipart privato con lease dedicato MoLab.
- MoLab scarica i file sorgente su disco in streaming (senza caricare un WAV
  da 512 MiB in RAM) e verifica la durata reale prima di elaborare.
- Durata richiesta massima del nuovo render: 480 secondi. Il cap di piano
  Studio rimane di 480 secondi; la quota proposta per Remix Pro rimane 3 volte
  la durata del render e richiede approvazione commerciale.

**Vincolo di rilascio:** gli unit test e la build non equivalgono a un vero
render musicale di otto minuti sulla GPU RTX PRO 6000. Verificare due sorgenti
lunghe con licenza, il task ACE-Step, il file finale, il consumo di VRAM,
la stabilita dei lease R2 e il mastering. Non abilitare i flag billing o la
generazione pubblica prima del collaudo end-to-end.
