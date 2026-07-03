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
uv tool install --with-executables-from solstone-journal-host 'solstone[journal]'
journal setup
```

(or `pipx install --include-deps 'solstone[journal]' && journal setup` if you prefer pipx. the quotes keep your shell from globbing the `[journal]` brackets.)

the `journal` and `mlx-vlm-server` commands live in the `solstone-journal-host` package that `[journal]` pulls in. `pip` exposes them natively, but `uv tool` and `pipx` only expose the base package's commands unless you add the flag shown above — without it you'd get `sol` but no `journal`.

`solstone[journal]` bundles everything your journal needs to run here — the default CPU transcription runtime is included and `journal setup` downloads the model. NVIDIA GPU owners who want GPU-accelerated transcription install `solstone[journal-cuda]` **instead of** `solstone[journal]` (pick one — the CPU and GPU runtimes must not both install).

want only the thin `sol` client — to talk to a journal running elsewhere (a second device, or a journal you reach over your private network)? install bare `solstone` (no extras), or run it ephemerally with `uvx`:

```bash
uv tool install solstone        # the sol client, on PATH
uvx solstone --help             # or one-shot, no install
```

then open http://localhost:5015 in a browser — the first-run wizard walks you through setting your identity and connecting a gemini API key. prefer OpenAI or Anthropic? choose the provider in Settings and it's set up for you — no separate command-line tool to install. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting. to run sol on your linux desktop, see [solstone.app/observers](https://solstone.app/observers).

## already have solstone installed?

get sol on more of your devices at https://solstone.app/observers.
