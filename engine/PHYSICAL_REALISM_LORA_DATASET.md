# SONARA Physical Realism LoRA Dataset V1

Place the training corpus on MoLab at:

`/marimo/SONARA-LORA-DATASET/`

The folder must contain `dataset.json` plus the referenced audio files.

## Mandatory rights policy

Only use audio that SONARA owns or has an explicit license permitting model training.

Allowed values:

- `license_type: "OWNED"`
- `license_type: "EXPLICITLY_LICENSED"`

Every row must also contain:

`"rights_to_train": true`

Synthetic ACE-Step generations may be used only for development diagnostics. They are rejected from production promotion.

## Instrument-family targets

Balance the corpus across:

- acoustic-drums
- piano-keys
- guitars-fretted
- bass
- bowed-strings
- brass-woodwinds

For a production promotion, SONARA requires at least 50 real recordings. A larger, clean and balanced corpus is strongly preferred.

## Training command

From MoLab, the SONARA launcher is:

`scripts/sonara-real-lora-train-1029.py`

It validates rights, preprocesses audio with Side-Step, runs corrected LoRA training, and accepts only a real PEFT adapter containing `adapter_config.json` and `adapter_model.safetensors`.
