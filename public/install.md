# solstone installation guide

solstone is your co-brain — your observers experience your day along with you, sol curates your memories, and your journal holds everything. open source, made by sol pbc.

your data stays on your machine. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar: `install solstone from https://solstone.app/install`

## install yourself

### macOS

**install the native app**

[download for macOS](https://solstone.app/download/macos) — signed by sol pbc, notarized by Apple. installs your observer and journal, opens the first-run wizard, and updates over a signed channel.

building from source? use the developer path in [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md).

### linux

prereqs: `uv` from astral.sh: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

```bash
uv tool install solstone
journal setup
```

(or `pipx install solstone && journal setup` if you prefer pipx.)

on linux, the default local parakeet transcription runtime ships with solstone and `journal setup` downloads the model. NVIDIA GPU owners who want GPU-accelerated transcription can add `solstone[parakeet-onnx-cuda]`.

then open http://localhost:5015 in a browser — the first-run wizard walks you through setting your identity and connecting a gemini API key. prefer OpenAI or Anthropic? choose the provider in Settings and solstone sets it up for you — no separate command-line tool to install. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting. for a linux observer, see [solstone.app/observers](https://solstone.app/observers).

## already have solstone installed?

find available observers at https://solstone.app/observers.
