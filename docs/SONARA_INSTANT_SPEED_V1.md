# SONARA Instant Speed V1

## Obiettivo

Ridurre la latenza reale del percorso di produzione senza riavviare ACE-Step e senza generare brani di test.

## Modifiche

- INSTANT (profilo interno `fast`) diventa il default per nuove sessioni.
- INSTANT genera un solo brano, non due: batch_size=1, un solo candidato, un solo inference step, LM thinking disattivato, nessun ranking automatico.
- QUALITY e ULTRA restano disponibili per chi preferisce più elaborazione.
- Il vecchio bridge Music Director non può più sovrascrivere un profilo già impostato dall'interfaccia nativa.
- Il controllo di generazione visibile usa polling a 350 ms in INSTANT invece di 2 secondi.
- Il relay R2 crea un indice di coda timestamp-ordered per ogni nuovo job. Il claim del notebook legge prima questo indice e non deve più attraversare la cronologia dei job completati.
- Il relay v5 già installato sul notebook è compatibile: non serve aggiornare l'agente per usare la nuova coda.

## Limite fisico

INSTANT elimina attese evitabili ma non può rendere a zero secondi un'inferenza GPU completa. La durata finale dipende comunque dalla lunghezza del brano, dal decoding e dal carico della RTX PRO 6000.
