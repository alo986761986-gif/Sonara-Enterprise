# Offline Model Download Guide - Sonara Labs

The Sonara Labs platform requires offline caching of the **facebook/musicgen-large** transformer model checkpoints to ensure minimal inference startup latency and high-speed local pipeline lookups.

---

## Storage & Path Layout

Models are downloaded and structured in standard layout format:

```
/workspace/models/musicgen-large/
├── config.json
├── pytorch_model.bin
├── state_dict.bin
├── compression_state_dict.bin
├── spiece.model
└── ...
```

---

## Running the Automatic Downloader

Run the standard Python utility from the root of your workspace:

```bash
python3 download_models.py
```

### Key Features of the Downloader:
- **HuggingFace Hub Integrations**: Leverages native snapshot downloading protocols.
- **Interruption Tolerance**: Resumes downloading seamlessly if your network connection drops.
- **Local Cache Mapping**: Stores weights directly inside the local persistent drive under `/workspace/models/musicgen-large` to prevent model redownloads when restarting instances.
- **Exclusion Filters**: Automatically ignores non-PyTorch parameters (e.g., Tensorflow or JAX model files) to save disk space.
