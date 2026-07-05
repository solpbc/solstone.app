# solstone installation guide

solstone is the platform, in two parts: sol — the app that lives on your devices, experiences your day with you, and keeps it all in your journal — the memory, on a computer you choose. open source, made by sol pbc.

your data stays on your device. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar: `install solstone from https://solstone.app/install`

## install yourself

### macOS

**install the native app**

<!-- install copy reflects CURRENT packaging (one download sets up sol + journal);
     revise to the educational sol / journal / both surface when Track B ships. -->
[download for macOS](https://solstone.app/download/macos) — signed by sol pbc, notarized by Apple. sets up sol and your journal on this Mac, opens the first-run wizard, and updates over a signed channel.

building from source? use the developer path in [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md).

### linux

prereqs: `uv` from astral.sh: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

run your journal here — the full host:

```bash
uv tool install solstone-journal && uv tool install solstone
journal setup
```

(or `pipx install solstone-journal && pipx install solstone && journal setup` if you prefer pipx.)

the `journal` host lives in the `solstone-journal` package; the `sol` client lives in `solstone`. `pip install solstone-journal` exposes both natively (`sol` comes along as a dependency). `uv tool` and `pipx` isolate each tool to its own package, so you install both `solstone-journal` and `solstone` to put both `journal` and `sol` on your PATH.

`solstone-journal` bundles everything your journal needs to run here — the default CPU transcription runtime is included and `journal setup` downloads the model. NVIDIA GPU owners who want GPU-accelerated transcription install `solstone-journal-cuda` **instead of** `solstone-journal` (pick one — the CPU and GPU runtimes must not both install).

want only the thin `sol` client — to talk to a journal running elsewhere (a second device, or a journal you reach over your private network)? install bare `solstone` (no extras), or run it ephemerally with `uvx`:

```bash
uv tool install solstone        # the sol client, on PATH
uvx solstone --help             # or one-shot, no install
```

then open http://localhost:5015 in a browser — the first-run wizard walks you through setting your identity and connecting a gemini API key. prefer OpenAI or Anthropic? choose the provider in Settings and it's set up for you — no separate command-line tool to install. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting. to run sol on your linux desktop, see [solstone.app/download](https://solstone.app/download).

## migrating from a pre-split install

already ran `solstone[journal]`, `solstone-journal-host`, or an older bare `solstone` journal? those spellings are retired — swap to the split packages once, matching how you installed:

```bash
pip:   pip uninstall solstone-journal-host && pip install solstone-journal
pipx:  pipx uninstall solstone && pipx install solstone-journal && pipx install solstone
uv:    uv tool uninstall solstone && uv tool install solstone-journal && uv tool install solstone
```

your journal directory and `journal setup` are unchanged — you're only renaming the package.

## already have solstone installed?

get sol on more of your devices at https://solstone.app/download.
