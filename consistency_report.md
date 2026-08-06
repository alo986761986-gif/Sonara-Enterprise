# 🔬 Sonara Labs - Consistency Audit Report

**Ruolo**: Principal Scientific Auditor  
**Stato Piattaforma**: **SOFTWARE FREEZE ATTO**  
**Data Audit**: 2026-08-01 15:11 UTC  
**STATO FINALE**: **NON COERENTE**  

---

## 📋 FASE 1: Verifica Filesystem Reale

Conteggio effettivo dei file fisici presenti sul disco nella directory `/app/applet/dataset`:

| Tipologia File | Conteggio Reale | Dimensione Totale (Byte) | Dimensione (MB) | Esempio Percorso |
| :--- | :---: | :---: | :---: | :--- |
| `audio.wav` | **33** | `11643852` | `11.1 MB` | `dataset/house/deep_house/audio.wav` |
| `prompt.json` | **33** | `23523` | `0.0224 MB` | `dataset/house/deep_house/prompt.json` |
| `analysis.json` | **33** | `13627` | `0.013 MB` | `dataset/house/deep_house/analysis.json` |
| `quality.json` | **33** | `18490` | `0.0176 MB` | `dataset/house/deep_house/quality.json` |
| `metadata.json` | **16** | `7766` | `0.0074 MB` | `dataset/house/deep_house/baseline_001/metadata.json` |
| `critic.json` | **15** | `8938` | `0.0085 MB` | `dataset/house/deep_house/baseline_001/critic.json` |
| `spectrogram.png` | **16** | `922864` | `0.88 MB` | `dataset/house/deep_house/baseline_001/spectrogram.png` |
| `waveform.png` | **16** | `26688` | `0.03 MB` | `dataset/house/deep_house/baseline_001/waveform.png` |

- **Totale Cartelle Traccia Fisiche**: **33** cartelle in `dataset/`

---

## 🗄️ FASE 2: Verifica Database

Risultati dell estrazione diretta dal database `/app/applet/engine/quality_database.json`:

- **Numero Produzioni Totali**: **2205**
- **Numero Gold (Quality ≥ 95)**: **620**
- **Numero Silver (90 ≤ Quality < 95)**: **1553**
- **Numero Bronze**: **0**
- **Numero Scartate (Quality < 90)**: **32**

### Verifica Schema dei Record
- **Record con schema standard completo**: **620**
- **Record con campi mancanti (es. timestamp o analysis di primo livello)**: **1585**

---

## 🔄 FASE 3: Cross-check Filesystem vs Database

Confronto puntuale tra i **2205** record del database e le **33** cartelle/bundle fisici presenti sul disco:

- **MATCH**: **0** record con corrispondenza ID/bundle diretta tra DB e filesystem.
- **MISSING**: **2205** record.
- **Esito FASE 3**: **MISSING / NON COERENTE**.
  - *Spiegazione*: Esistono solo 33 file `audio.wav` e cartelle di traccia reali sul disco, mentre il database dichiara 2,205 produzioni. 2,172 voci di database non possiedono alcun artefatto audio o file manifest associato nel filesystem.

---

## 📊 FASE 4: Verifica Benchmark

- **Stato Benchmark**: **BENCHMARK NON VALIDO**
- *Anomalie Identificate*:
  1. `benchmark_dataset.json` contiene **1,000** valutazioni di prompt e confronta `ACE-Step Base` vs `LoRA V1`.
  2. Tuttavia, i report precedenti di validazione dichiaravano un campione $n = 2,205$ sincronizzato con il database.
  3. Poiché per 2,172 di queste produzioni non esistono file `audio.wav` o analisi acustiche reali sul disco, il benchmark valuta dati puramente sintetici non verificabili sul piano acustico reale.

---

## 🔐 FASE 5: Checksum Verification

Calcolo dei checksum SHA256 dei principali componenti del sistema:

| Componente / Risorsa | Checksum SHA256 |
| :--- | :--- |
| **Dataset Fisico + Quality Database** | `7d643322ffa85eb6dfad58b6338c0ba26a30cc93053fdcad4cba308fdd35c0d6` |
| **Benchmark Dataset** (`benchmark_dataset.json`) | `ecf5a7ff44050e29641cebb407c8f2699b14adf198670ae16956ae824b8e6589` |
| **Leaderboard** (`engine/leaderboard.json`) | `dc70f529548d0fe0af7146a2d65ffbbbaa36a654e543b7edf147b4d3241fbf94` |
| **Learning Memory** (`engine/learning_memory.json`) | `0024eb4bbbb6098491a696d512c8cb798e62bc5c0b440ab7d6c358f536e5ee65` |

---

## 🔲 FASE 6: Matrice di Coerenza

| Livello dell Architettura | Valutazione Audit | Motivo del Risultato |
| :--- | :---: | :--- |
| **Filesystem** | **NON COERENTE** | Solamente 33 cartelle traccia reali; 17 cartelle prive di `metadata.json`/spettrogrammi. |
| **Database** | **NON COERENTE** | 2,205 record registrati, di cui 2,172 privi di traccia audio su disco; 1,585 privi di schema standard. |
| **Benchmark** | **NON COERENTE** | Discrepanza tra la dimensione del dataset del benchmark (1,000 item) e le asserzioni di report ($n=2205$). |
| **Report** | **NON COERENTE** | Dichiarazioni di validazione su campioni privi di veridicità acustica/fisica sul filesystem. |

---

## 🏁 DICHIARAZIONE FINALE AUDITOR

**STATO FINALE**: **NON COERENTE**

### Spiegazione Dettagliata delle Incoerenze:
1. **Discrepanza Quantitativa Fisico vs Logico**: Sul disco fisicamente sono presenti **33** file `audio.wav`, mentre `quality_database.json` contiene **2,205** record.
2. **Incompletezza del Bundle**: Nelle 33 cartelle fisiche, solo 16 contengono `metadata.json`, `spectrogram.png`, `waveform.png` e solo 15 contengono `critic.json`.
3. **Incoerenza di Schema Database**: 1,585 record nel database sono privi di timestamp formattato ISO o struttura `analysis` separata.
4. **Impossibilità di Verifica Acustica**: I results del benchmark non sono associabili a file audio reali per 2,172 produzioni.

In ottemperanza al **SOFTWARE FREEZE**, nessun codice o dato è stato automaticamente modificato. Il sistema rimane inalterato per revisione.
