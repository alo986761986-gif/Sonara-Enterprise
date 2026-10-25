# SONARA Instrument Realism V1

## Obiettivo

Migliorare il realismo percepito della strumentazione nelle generazioni QUALITY e ULTRA senza aggiungere strumenti non richiesti e senza rallentare FAST.

## Cosa cambia

Il payload R2 aggiunge una breve istruzione di performance fisica derivata dagli strumenti scelti e dal contesto di stile. Non è un effetto audio posticcio: descrive al modello come devono comportarsi le sorgenti.

Profili coperti:

- piano e tastiere: attacco legato alla velocity, pedale, decadimento e risonanza dipendente dal registro;
- archi ad arco: pressione/arco, legato, vibrato e risonanza della cassa;
- chitarre e corde pizzicate: plettro/dita, risonanza di corda/tasto e rilascio;
- basso: variazione dell'attacco, durata della nota, slide e peso fisico del registro grave;
- batteria acustica: velocity differenti, ghost notes, decadimento dei piatti e immagine kit/room coerente;
- percussioni a mano: posizione e forza del colpo, decadimento reale e subdivision umana;
- ottoni: attacco di fiato/imboccatura, swell e collegamenti naturali di intonazione;
- legni: fraseggio di fiato, attacchi di lingua/legato e rumori meccanici solo sottili;
- organi/ance: sustain non statico e articolazione realistica;
- synth e drum machine: movimento intenzionale di oscillatore, filtro, inviluppo e modulazione, senza fingere rumore acustico.

Ogni generazione QUALITY/ULTRA aggiunge inoltre tre vincoli comuni: dinamica e microtiming a livello di frase, prospettiva microfonica/ambiente coerente e divieto di attacchi clonati o transienti plastici.

FAST non viene modificato da questo layer.

## Reference audio

ACE-Step supporta reference audio per controllare timbro, mix e performance style. Questo è il passo successivo a maggiore leva, ma richiede registrazioni di riferimento realmente utilizzabili e un percorso di upload/server valido. Instrument Realism V1 non inventa né scarica reference audio e non imposta path fittizi.

## Verifica

I test controllano che gli strumenti selezionati attivino le famiglie corrette, che FAST resti invariato e che QUALITY/ULTRA ricevano i cue fisici mantenendo prompt, testo, BPM, tonalità, durata e due risultati.

La qualità sonora reale va valutata sui brani generati; i test di codice non possono dimostrare da soli un miglioramento percettivo.
