# SONARA Enterprise — GPU dedicata, senza RunPod

## Architettura

Client autenticato SONARA → Vercel `/api/billing/generate` → Cloudflare Worker `api.sonaraenterprise.com` → HTTPS `gpu.sonaraenterprise.com` → Caddy → gateway locale autenticato `127.0.0.1:8002` → ACE-Step REST API `127.0.0.1:8001` → RTX PRO 6000.

Il polling del job usa Vercel `/api/billing/job?jobId=gpu_...`; il Worker firma per 24 ore i link audio `/api/gpu/audio`. I modelli sono **`acestep-v15-xl-turbo`** e **`acestep-5Hz-lm-4B`**. Sono disabilitati i fallback Eleven Music, YuE e RunPod per la generazione principale. MoLab resta disponibile **soltanto come ambiente di sviluppo**.

## 1. Acquisto/provisioning — intervento del proprietario

Provider preferito: **Nebius AI Cloud**, **1× NVIDIA RTX PRO 6000 Blackwell (96 GB VRAM)**, VM Ubuntu con driver NVIDIA, indirizzo IPv4 pubblico, disco persistente **almeno 200 GB**, zona UE dove disponibile. L'account Nebius e il metodo di pagamento sono obbligatori; non sono stati creati dalla PR.

Prezzo indicativo pubblicato al 22 ottobre 2026: **US$ 1,80/ora GPU on-demand** (circa **US$ 1.296 ogni 30 giorni sempre accesa**), esclusi IVA, storage e altre spese. Verificare prezzo e disponibilità nella console prima di avviare la VM. Evitare Spot/preemptible per servizi live che richiedono continuità.

Nel firewall/security group della VM consentire **TCP 443** e **TCP 80** da Internet (TLS automatico Caddy) e **SSH 22 solo dall'IP dell'amministratore**. **Non esporre TCP 8001, 8002 o 7860.** Preconfigurare monitoraggio, avvisi di budget e snapshot dei dischi.

Fonti: https://nebius.com/prices , https://nebius.com/self-service

## 2. Installare dipendenze sulla VM

Prerequisiti **Docker Engine + Docker Compose plugin + NVIDIA Container Toolkit**, `caddy`, `git`, `curl`, `openssl`, Python 3.11+ e driver CUDA compatibile con RTX PRO 6000. Le immagini GPU di Nebius includono normalmente i driver, ma il runtime NVIDIA per Docker deve essere verificato.

Documentazione ufficiale:
- Docker Engine Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- NVIDIA Container Toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
- Caddy: https://caddyserver.com/docs/install

Accedere tramite SSH, clonare la feature branch nel filesystem della **VM**, quindi:

```bash
git clone --branch feature/sonara-dedicated-rtxpro6000-20261022 \
  https://github.com/alo986761986-gif/Sonara-Enterprise.git
cd Sonara-Enterprise
sudo bash deploy/dedicated-gpu/bootstrap.sh
```

Se il repository è privato, utilizzare l'accesso GitHub del proprietario senza mettere token nel comando o nei log.

Lo script **non compra né avvia la VM**. Una volta eseguito sulla GPU, crea solo i file locali e i servizi necessari. Clona ACE-Step dal commit verificato `ca1e85fe9430179831e6bc6be790c332190a3866`, costruisce il container e scarica i checkpoint la prima volta. L'avvio iniziale può richiedere tempo per i modelli. I file persistenti rimangono sotto `/opt/sonara/checkpoints`, `/opt/sonara/hf-cache` e `/opt/sonara/output`.

**Importante:** il server ACE-Step su `127.0.0.1:8001` non è esposto. Il gateway `127.0.0.1:8002` richiede un bearer token per ogni endpoint. Caddy riceve il traffico TLS su 443 e lo inoltra esclusivamente al gateway; non serve alcun Cloudflare Tunnel.

## 3. Collegare il DNS HTTPS

Nel pannello Cloudflare della zona `sonaraenterprise.com`, creare/aggiornare un record **A**:

- Nome: `gpu`
- Indirizzo: **IPv4 pubblico effettivo** della VM Nebius
- Proxy: **DNS only** inizialmente per facilitare il rilascio del certificato HTTPS da Caddy

Non modificare il dominio pubblico SONARA e non eliminare i record esistenti. Accertarsi che Caddy possa ricevere ingressi TCP 80/443 e completare il certificato. Dalla VM, lanciare:

```bash
sudo bash deploy/dedicated-gpu/check-cutover.sh
```

Esito richiesto: richieste anonime HTTP 401/403, richieste HTTPS autenticate HTTP 200, entrambi i modelli effettivamente inizializzati. Se il test fallisce, **non procedere al deploy**. Nessuna chiave va inviata in chat.

## 4. Chiavi private — due segreti DIFFERENTI

**A. Chiave origin GPU**, generata dallo script e conservata sul server in `/etc/sonara/gateway.key`. Il proprietario la trasferisce in modo sicuro su GitHub → Settings → Secrets and variables → Actions come `SONARA_DEDICATED_GPU_ORIGIN_KEY`. Non copiarla nei file del repository né nei messaggi.

**B. Segreto di proxy interno** tra il billing Vercel e il Cloudflare Worker: generarne uno nuovo di **almeno 32 caratteri casuali**, diverso dalla chiave GPU; installare il valore identico come:
- GitHub Actions secret `SONARA_INTERNAL_PROXY_SECRET`
- Vercel, progetto `sonara-enterprise`, variabile **Production** `SONARA_INTERNAL_PROXY_SECRET`

**Ridispiegare il frontend Vercel** dopo aver impostato la variabile Production: il valore non raggiunge automaticamente i deployment già attivi.

GitHub Actions richiede anche le credenziali Cloudflare `CLOUDFLARE_API_TOKEN` (o `CF_API_TOKEN`); facoltativamente `CLOUDFLARE_ACCOUNT_ID`. Le credenziali GPU e billing restano segrete. Il workflow pubblica su Cloudflare un file privato effimero, poi lo elimina.

## 5. Cutover controllato in produzione

1. Accertarsi che `check-cutover.sh` sia **interamente verde** e che i test GitHub della PR siano superati.
2. Revisionare e unire la nuova PR dedicata a `main`. **Non unire la vecchia PR MoLab #43** al posto di questa: gestisce un tunnel offline.
3. Dopo aver configurato `SONARA_INTERNAL_PROXY_SECRET`, confermare su Vercel che il deployment **Production** basato su `main` risulti `READY`.
4. GitHub → Actions → **Deploy SONARA Dedicated GPU** → Run workflow su `main`. Spuntare entrambe le conferme *solo se vere*. Il workflow verifica la protezione dell'origin e i due modelli **prima** di pubblicare il Worker.
5. Verificare `https://api.sonaraenterprise.com/api/gpu/ready` con `provider: "dedicated_gpu"`, `ready: true`, `realMusicReady: true`; poi eseguire un brano reale con un account SONARA, controllando creazione, polling `gpu_`, WAV, riproduzione, e riserva/consumo crediti.

Il deploy Cloudflare non è eseguito automaticamente da questa PR. Il dominio pubblico rimane come prima finché la macchina dedicata e i segreti non sono configurati e il workflow manuale non supera i controlli.

## 6. Operatività, costi e sicurezza

- Stato ACE-Step: `sudo docker compose -f deploy/dedicated-gpu/docker-compose.yml ps`; log: `sudo docker logs sonara-acestep-xl-turbo --tail 100`.
- Stato gateway: `sudo systemctl status sonara-gateway --no-pager`; log: `sudo journalctl -u sonara-gateway -n 50 --no-pager`.
- HTTPS: `sudo systemctl status caddy --no-pager`.
- Riavvio senza perdere modelli: `sudo docker compose -f deploy/dedicated-gpu/docker-compose.yml restart`; i checkpoint sono su volume persistente.
- **Budget:** VM sempre accesa = costo orario continuo, anche senza utenti. Impostare allarme di spesa sul provider. Una VM spenta blocca la generazione pubblica; verificare eventuali costi persistenti di storage/IP.
- **Se un test pubblico fallisce:** ripristinare la precedente versione Cloudflare/Vercel, senza rimuovere la GPU o i dati, e investigare in ambiente privato.
- **Sicurezza:** non inoltrare API keys ai browser, non aprire :8001/:8002, non usare link audio non firmati, non condividere i file in `/etc/sonara`.

Questo pacchetto prepara il deployment ma **non prova che una VM Nebius sia stata comprata o che SONARA generi già musica in produzione**.
