# SONARA — ACE-Step XL Turbo: baseline di qualità

## Scopo e stato

Questa modifica migliora la configurazione effettivamente inviata ad ACE-Step sul percorso HTTPS/R2 di SONARA. Non sostituisce i pesi del modello e non costituisce una dimostrazione di parità con Suno v6.

Runtime di riferimento: ACE-Step 1.5, revisione `ca1e85fe9430179831e6bc6be790c332190a3866`, modello `acestep-v15-xl-turbo`, LM `acestep-5Hz-lm-4B`, MoLab RTX PRO 6000. Il relay esistente inoltra il payload a `/release_task`.

## Profili applicati al percorso R2

| Profilo | Passaggi DiT | Shift | Pianificazione musicale LM | Uso |
| --- | ---: | ---: | --- | --- |
| FAST | 1 | 1.0 | No | Mantiene il percorso rapido per le anteprime |
| QUALITY | 8 | 3.0 | No | Rendering Turbo con la configurazione di riferimento documentata |
| ULTRA | 8 | 3.0 | Sì | Aggiunge i codici musicali semantici del LM già caricato |

Tutti e tre mantengono due risultati quando il Music Creator richiede due brani, la durata richiesta, la lingua, BPM, tonalità, formato WAV e le impostazioni di normalizzazione esistenti. La richiesta conserva un solo batch; non vengono aggiunte rigenerazioni, selezioni automatiche o riparazioni audio.

QUALITY e ULTRA richiedono più lavoro del precedente profilo a due passaggi. La latenza delle nuove configurazioni non è stata misurata. I tempi di circa 15 secondi osservati in precedenza appartengono alla vecchia configurazione e non sono una promessa per i nuovi profili.

## Perché questi valori

La guida ufficiale raccomanda 8 passaggi e shift 3.0 per Turbo. Aumentare il CFG del DiT non è una scorciatoia per la qualità: Turbo incorpora la guidance nella distillazione e usa 1.0.

ULTRA usa la funzione nativa `thinking=true`, che produce i codici musicali del LM. Non richiede l'estensione personalizzata `sonara-realism-api-v1`. Il modello LM già inizializzato viene riutilizzato.

I parametri LM seguono i valori di riferimento REST: temperatura 0.85, CFG 2.5, top-p 0.9. Caption e lingua non vengono riscritte dal LM; `use_format` e `sample_mode` restano disattivati. Il testo originale del brano viene preservato.

`thinking=false` disattiva i codici musicali del LM; non garantisce che il server non usi mai il LM per completare metadati mancanti. I vecchi campi `use_cot_metas`, `use_constrained_decoding` e `lm_batch_chunk_size` non sono controlli del parser REST installato e vengono rimossi dal payload R2.

## Prompt e interfaccia

Il prompt R2 usa una descrizione musicale compatta con genere, atmosfera, voce, lingua, strumenti e intenzione originale dell'autore. Le lunghe istruzioni generate dal sistema non vengono concatenate. I controlli creativi del sito rimangono descritti nel prompt.

La guida suggerisce caption entro 512 caratteri e testi entro 4096 caratteri. Questa modifica non tronca silenziosamente un prompt o un testo dell'utente che superi tali indicazioni.

Il selettore del sito descrive il compromesso tra qualità e attesa. Sono eliminati i punteggi 82/88/92+ privi di una misurazione associata e la promessa di quattro candidati ULTRA.

## Verifica e limiti

I controlli automatici riguardano il contratto delle richieste, la conservazione dei dati dell'autore e la compilazione. Non viene avviata alcuna nuova generazione musicale per la verifica, né un addestramento o un riavvio del motore.

Un miglioramento udibile non si dimostra con il numero di passaggi. Per valutare il risultato delle generazioni reali occorre distinguere: intelligibilità e fedeltà del testo, timbro vocale, melodia, struttura, aderenza al genere, artefatti audio, diversità dei due risultati e tempo di attesa. Nessun punteggio di ascolto o confronto con Suno viene inventato.

Ulteriori interventi sui pesi, LoRA, ranking o riparazione delle sezioni richiedono dati audio appropriati e una valutazione dedicata. Non sono attivati da questo aggiornamento.

## Fonti ufficiali

- [ACE-Step: guida di inferenza alla revisione installata](https://github.com/ace-step/ACE-Step-1.5/blob/ca1e85fe9430179831e6bc6be790c332190a3866/docs/en/INFERENCE.md)
- [ACE-Step: API REST alla revisione installata](https://github.com/ace-step/ACE-Step-1.5/blob/ca1e85fe9430179831e6bc6be790c332190a3866/docs/en/API.md)
- [ACE-Step: tutorial musicale](https://github.com/ace-step/ACE-Step-1.5/blob/ca1e85fe9430179831e6bc6be790c332190a3866/docs/en/Tutorial.md)
- [Suno: introduzione della famiglia v6, 9 settembre 2026](https://suno.com/release-notes/introducing-v6)

