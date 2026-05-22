# solstone installation guide

solstone is your co-brain — your observers experience your day along with you, sol curates your memories, and your journal holds everything. open source, made by sol pbc.

your data stays on your machine. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar: `install solstone from https://solstone.app/install`

## install yourself

### macOS

**1. install the native observer app**

[download for macOS](https://solstone.app/download/macos) — signed by sol pbc, notarized by Apple. updates over a signed channel.

**2. set up sol and your journal**

this sets up sol and creates your journal — the place on your machine where sol tends your memories.

prereqs: xcode command-line tools (`xcode-select --install`), homebrew (https://brew.sh), then `brew install uv`.

```bash
uv tool install solstone
sol setup
```

(or `pipx install solstone && sol setup` if you prefer pipx.)

then open http://localhost:5015 in a browser — the first-run wizard walks you through setting your identity and connecting a gemini API key. prefer OpenAI or Anthropic? choose the provider in Settings and solstone sets it up for you — no separate command-line tool to install. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting.

### linux

prereqs: `uv` from astral.sh: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

```bash
uv tool install solstone
sol setup
```

(or `pipx install solstone && sol setup` if you prefer pipx.)

on linux, local parakeet transcription needs `solstone[parakeet-onnx-cpu]` (or `[parakeet-onnx-cuda]` for NVIDIA GPUs); install or upgrade the same way as other extras.

then open http://localhost:5015 in a browser — the first-run wizard walks you through setting your identity and connecting a gemini API key. prefer OpenAI or Anthropic? choose the provider in Settings and solstone sets it up for you — no separate command-line tool to install. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting. for a linux observer, see [solstone.app/observers](https://solstone.app/observers).

## already have solstone installed?

find available observers at https://solstone.app/observers.
