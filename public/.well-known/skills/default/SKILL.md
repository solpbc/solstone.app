---
name: solstone-install
description: Install and configure solstone, the platform in two parts — sol, the app that experiences your day with you, and the journal, the memory sol keeps. Use when the user asks to install solstone, set up solstone, or mentions solstone.app. Supports linux and macOS.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.0"
  website: https://solstone.app
  repository: https://github.com/solpbc/solstone-journal
---

# solstone installation

these instructions are for a coding agent and human working together. solstone is the platform, in two parts: sol — the app that lives on your devices, experiences your day with you, and keeps it all in your journal — the memory, on a computer you choose. open source, made by sol pbc.

your data stays on your device. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## instructions

fetch the install guide and follow it step by step:

```
https://solstone.app/install
```

the guide covers platform detection, prerequisites, installation, setup, service verification, getting sol onto devices, and human handoff.

## quick reference

- **repo:** https://github.com/solpbc/solstone-journal
- **macOS app (sol on your Mac):** https://github.com/solpbc/solstone-macos
- **requires:** python 3.11+, uv, ffmpeg, a Google AI Studio API key
- **install (run a journal here):** `uv tool install solstone-journal && uv tool install solstone && journal setup` — two tools so both `journal` and `sol` land on your PATH (`pip install solstone-journal` exposes both natively in one step; NVIDIA GPU owners install `solstone-journal-cuda` instead of `solstone-journal`, never both)
- **install (thin `sol` client only, talk to a journal elsewhere):** `uv tool install solstone` — or `uvx solstone` for a one-shot
- **migrate from a pre-split install:** `pip uninstall solstone-journal-host && pip install solstone-journal` (pip) · `pipx uninstall solstone && pipx install solstone-journal && pipx install solstone` (pipx) · `uv tool uninstall solstone && uv tool install solstone-journal && uv tool install solstone` (uv) — `journal setup` unchanged
- **configure:** open http://localhost:5015 after setup; the first-run wizard handles password, identity, and gemini API key
- **docs:** https://solstone.app/llms.txt
