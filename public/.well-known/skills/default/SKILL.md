---
name: solstone-install
description: Install and configure solstone, the co-brain made of observers, sol agent, and journal. Use when the user asks to install solstone, set up solstone, or mentions solstone.app. Supports linux and macOS.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.0"
  website: https://solstone.app
  repository: https://github.com/solpbc/solstone
---

# solstone installation

these instructions are for a coding agent and human working together. solstone is your co-brain — your observers experience your day along with you, sol curates your memories, and your journal holds everything. open source, made by sol pbc.

your data stays on your machine. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## instructions

fetch the install guide and follow it step by step:

```
https://solstone.app/install
```

the guide covers platform detection, prerequisites, installation, setup, service verification, observer installation, and human handoff.

## quick reference

- **repo:** https://github.com/solpbc/solstone
- **macOS observer app:** https://github.com/solpbc/solstone-macos
- **requires:** python 3.11+, uv, ffmpeg, a Google AI Studio API key
- **install:** `uv tool install solstone && sol setup`
- **configure:** open http://localhost:5015 after setup; the first-run wizard handles password, identity, and gemini API key
- **docs:** https://solstone.app/llms.txt
