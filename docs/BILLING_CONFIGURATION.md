# SONARA Billing — configurazione di produzione

Il codice include tre piani reali: Free, Creator e Studio. Il pagamento usa Stripe Checkout, il portale Stripe e webhook firmati. Firebase Authentication identifica l'utente; Firestore conserva abbonamento, periodo e secondi consumati.

## 1. Prodotti e prezzi Stripe

Nel Dashboard Stripe creare due prodotti con quattro prezzi ricorrenti in EUR:

| Prodotto | Frequenza | Importo |
| --- | --- | ---: |
| SONARA Creator | mensile | 12,99 € |
| SONARA Creator | annuale | 119,90 € |
| SONARA Studio | mensile | 29,99 € |
| SONARA Studio | annuale | 287,90 € |

Copiare gli identificativi `price_...` nelle variabili `STRIPE_PRICE_*` indicate in `.env.example`.

Prima di abilitare Checkout inserire anche `SONARA_LEGAL_VERSION`, `SONARA_TERMS_URL` e `SONARA_PRIVACY_URL`. Il pagamento resta volutamente disabilitato se manca uno di questi valori. Stripe richiederà l'accettazione dei Termini durante Checkout e la versione accettata resterà nei metadati della sessione e dell'abbonamento.

Le pagine pubbliche sono già disponibili nel progetto agli indirizzi `/terms` e `/privacy`. Compilare in Vercel le variabili pubbliche `VITE_LEGAL_OPERATOR_NAME`, `VITE_LEGAL_OPERATOR_TAX_ID`, `VITE_LEGAL_OPERATOR_ADDRESS` e `VITE_LEGAL_CONTACT_EMAIL`; i valori compariranno nei documenti e saranno quindi visibili ai visitatori. Impostare anche `VITE_LEGAL_VERSION` con lo stesso valore di `SONARA_LEGAL_VERSION`.

`SONARA_LEGAL_PUBLISH_READY` deve restare `false` durante la compilazione e la revisione. Portarlo a `true` soltanto quando identità del fornitore, dati fiscali, indirizzo, email, prezzi, licenza commerciale, recesso e rimborsi sono stati verificati. Questo è un blocco server aggiuntivo: una pagina incompleta non può attivare Checkout per errore.

## 2. Webhook Stripe

Creare l'endpoint:

`https://sonaraenterprise.com/api/billing/webhook`

Eventi richiesti:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copiare il signing secret in `STRIPE_WEBHOOK_SECRET`. Il backend rifiuta eventi con firma errata, timestamp vecchio o identificativo già elaborato.

Nel Customer Portal Stripe abilitare cambio piano, annullamento a fine periodo, aggiornamento del metodo di pagamento e cronologia fatture. Configurare `https://sonaraenterprise.com` come URL di ritorno, `https://sonaraenterprise.com/terms` per i Termini e `https://sonaraenterprise.com/privacy` per la Privacy. SONARA impedisce di aprire un secondo Checkout quando esiste già un abbonamento attivo, evitando doppi addebiti: gli upgrade e downgrade passano dal portale. Il portale resta accessibile agli abbonati esistenti anche se Checkout viene temporaneamente disabilitato, così possono sempre gestire o annullare il piano.

## 3. Firebase Admin e Firestore

Creare un service account Firebase dedicato al backend e inserire il JSON completo, su una sola riga, in `FIREBASE_SERVICE_ACCOUNT_JSON`. Non usare mai questa credenziale in una variabile `VITE_*`.

Le collezioni server sono:

- `sonaraBilling/{firebaseUid}`
- `sonaraBilling/{firebaseUid}/reservations/{reservationId}`
- `sonaraBillingCustomers/{stripeCustomerId}`
- `sonaraBillingEvents/{stripeEventId}`

Le regole Firestore pubbliche devono negare lettura e scrittura client a queste collezioni. Il pannello utente legge i dati solo tramite `/api/billing/status` con token Firebase verificato.

## 4. Protezione del motore

Generare una stringa casuale lunga almeno 32 byte e salvare lo stesso valore come `SONARA_INTERNAL_PROXY_SECRET` sia su Vercel sia sul Worker Cloudflare del motore. Quando la variabile è presente, il motore rifiuta tutte le generazioni che non arrivano dal proxy pagamenti autorizzato.

Durante il primo collaudo usare:

`BILLING_ENFORCEMENT_MODE=observe`

Dopo aver verificato Stripe, Firebase e il webhook impostare:

`BILLING_ENFORCEMENT_MODE=enforce`

In modalità `enforce`, SONARA non avvia una generazione se Firestore o il controllo quote non sono disponibili.

## 5. Collaudo prima del live

1. Usare chiavi e prezzi Stripe in modalità test.
2. Registrare un nuovo account Firebase.
3. Verificare che Free consenta al massimo 60 secondi per brano e 10 minuti nel mese.
4. Acquistare Creator con una carta di test Stripe.
5. Verificare il passaggio automatico a 120 minuti e 4 minuti per brano.
6. Aprire il portale, annullare a fine periodo e verificare `cancelAtPeriodEnd`.
7. Simulare `invoice.payment_failed` e `customer.subscription.deleted`.
8. Controllare che una richiesta diretta al motore senza secret riceva HTTP 401.
9. Verificare che `/terms` e `/privacy` non mostrino più campi `[DA COMPLETARE]` o l'avviso di bozza.
10. Passare alle chiavi live e impostare `SONARA_LEGAL_PUBLISH_READY=true` soltanto dopo la verifica di Termini, Privacy, rimborsi, IVA e licenza commerciale.

## 6. Regola economica

Le quote iniziali sono 120 e 500 minuti. Prima di confermarle definitivamente, misurare per almeno sette giorni il costo medio effettivo di GPU, rigenerazioni di qualità, storage e traffico. Se il costo supera il margine stabilito, modificare `includedSeconds` in `src/billing/plans.ts` prima del lancio commerciale.
