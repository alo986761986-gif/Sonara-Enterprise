# SONARA Mix/Master Profile V1

## Scopo

Il percorso ACE-Step/R2 ora usa un profilo mix/master coerente con genere e strumentazione senza collegare il vecchio DSP MusicGen al motore di produzione.

ACE-Step 1.5 espone una normalizzazione finale a target di picco. SONARA la tratta correttamente come peak normalization, non come misurazione LUFS.

## Profili

- orchestral-dynamic: -2.0 dB peak, macro-dinamica e profondità naturale;
- ambient-open: -2.0 dB peak, code e dettaglio a basso livello;
- acoustic-natural: -1.5 dB peak, transienti e room naturale;
- organic-groove: -1.2 dB peak, pocket e midrange caldo;
- cinematic-depth: -1.5 dB peak, foreground/midground/background;
- band-forward, urban-punch, electronic-punch, modern-balanced: -1.0 dB peak.

Se l'utente/API chiede più headroom, per esempio -3 dB, SONARA conserva il valore più prudente. Un valore aggressivo come -0.1 dB viene ricondotto al limite di sicurezza del profilo. Un opt-out esplicito dalla normalizzazione resta rispettato.

## Mix guidance

Il caption QUALITY/ULTRA aggiunge indicazioni per:
- separazione kick/bass;
- registri complementari per piano/chitarre;
- profondità coerente per archi/fiati;
- spazio per voce/lead;
- stereo width senza allargare il sub;
- automazione e densità che cambiano tra sezioni in ULTRA.

FAST non viene modificato.

## Perché non viene usato il vecchio 14-stage engine

Il DSP presente in engine/dsp_engine.py appartiene a un percorso legacy MusicGen. Inserirlo automaticamente dopo ACE-Step potrebbe modificare durata, transitori, immagine stereo e dinamica con regole fisse non validate per XL Turbo. V1 usa quindi solo controlli nativi ACE-Step e conditioning del modello sul percorso di produzione reale.
