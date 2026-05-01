---
name: solstone-install
description: Install and configure solstone, an AI life journal that captures everything you see and hear. Use when the user asks to install solstone, set up solstone, or mentions solstone.app. Supports linux and macOS.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.0"
  website: https://solstone.app
  repository: https://github.com/solpbc/solstone
---

# solstone installation

solstone is an open source AI life journal — captures everything you see and hear on your computer, processes it with AI, and gives you superhuman memory. your data resides on your machine. made by sol pbc, a public benefit corporation with irrevocable data covenants — your data can never be sold, and any acquisition must preserve the same protections. supported on linux and macOS.

## instructions

fetch the install guide and follow it step by step:

```
https://solstone.app/install
```

the guide is written for AI agents and covers platform detection, prerequisites, installation, configuration, startup verification, and human handoff.

## quick reference

- **repo:** https://github.com/solpbc/solstone
- **macOS capture app:** https://github.com/solpbc/solstone-macos
- **requires:** python 3.10+, git, ffmpeg, uv, a Google AI Studio API key
- **install:** `git clone https://github.com/solpbc/solstone.git && cd solstone && make install`
- **config:** `journal/config/journal.json` (API keys, web UI password)
- **run:** `.venv/bin/sol supervisor`
- **docs:** https://solstone.app/llms.txt
