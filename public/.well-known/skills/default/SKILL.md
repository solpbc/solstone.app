---
name: solstone-install
description: Install and configure solstone, the platform in two parts — sol, the app that experiences your day with you, and the journal, the memory sol keeps. Use when the user asks to install solstone, set up solstone, or mentions solstone.app. Supports linux and macOS.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.0"
  website: https://solstone.app
  repository: https://github.com/solpbc/solstone
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

- **repo:** https://github.com/solpbc/solstone
- **macOS app (sol on your Mac):** https://github.com/solpbc/solstone-macos
- **requires:** python 3.11+, uv, ffmpeg, a Google AI Studio API key
- **install (run a journal here):** `uv tool install --with-executables-from solstone-journal-host 'solstone[journal]' && journal setup` — the flag is required so `uv tool` exposes the `journal`/`mlx-vlm-server` commands (they live in the `solstone-journal-host` package `[journal]` pulls in; `pip` exposes them natively, `uv tool`/`pipx` need the flag / `--include-deps`)
- **install (thin `sol` client only, talk to a journal elsewhere):** `uv tool install solstone` — or `uvx solstone` for a one-shot
- **configure:** open http://localhost:5015 after setup; the first-run wizard handles password, identity, and gemini API key
- **docs:** https://solstone.app/llms.txt
