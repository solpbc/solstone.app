# solstone installation guide

solstone is a personal memory platform. the solstone app takes in what you share with it, and all of it goes into your journal, the memory, on a device you own. open source, made by sol pbc.

your journal always lives on a device you own. sol pbc is a public benefit corporation with legal covenants that can't be amended without the founder's personal signature, and after him, the language can only get stronger, never weaker: your data is never sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar: `install solstone from https://solstone.app/install`

## install yourself

### macOS

**install the native app**

[download for macOS](https://solstone.app/download/macos), for Apple Silicon macs; Intel macs aren't supported. signed by sol pbc, notarized by Apple. sets up the solstone app and your journal on this mac, opens the first-run wizard, and updates over a signed channel.

building from source? use the developer path in [INSTALL.md](https://github.com/solpbc/solstone-journal/blob/main/INSTALL.md).

### linux

the journal ships as one self-contained tree. it needs no interpreter and no package manager of its own. the two commands are `solstone` and `journal`. one tree covers the journal on this machine and talking to a journal that already lives elsewhere.

the tree is not published yet. its release channel is `updates.solstone.app`, and `install.sh` is already live at [solstone.app/install.sh](https://solstone.app/install.sh) — until the first release lands, start from a local build or a copy someone handed you and follow [INSTALL.md](https://github.com/solpbc/solstone-journal/blob/main/INSTALL.md). once it is published:

```bash
curl -fsSL https://solstone.app/install.sh | sh
journal setup
```

then open http://localhost:5015 in a browser. the first-run wizard walks you through setting your identity and choosing among three ways to think: local on your device (the default on capable hardware), your own AI engine (bring a Claude, Gemini, or OpenAI token, or point the solstone app at any OpenAI-compatible endpoint you run), or confidential processing operated by sol pbc (available to approved scouts). your journal stays on your device whichever you choose. see [INSTALL.md](https://github.com/solpbc/solstone-journal/blob/main/INSTALL.md) for full details and troubleshooting. to run the solstone app on your linux desktop, see [solstone.app/download](https://solstone.app/download).

### where your journal lives

your journal lives on linux machines (Intel/AMD or ARM) and on Apple Silicon macs running macOS 14 or later. anywhere else, you can still read and search a journal kept on another machine through the solstone app, but that machine can't host one of its own. you get told that plainly instead of a half-working install. if owners turn up on a machine we don't cover, we add it.

### windows

install solstone for windows: the solstone app runs on your PC (screen and system audio, mic when present) and pairs with a journal running on your mac or linux machine. the journal doesn't run on windows yet, so keep your journal on a mac or linux machine and pair windows to it. two ways to install:

- **signed installer:** download from [solstone.app/download/windows](https://solstone.app/download/windows) and run it — installs per-user in the tray, no admin needed, and updates itself.
- **scoop:** `scoop bucket add solstone https://github.com/solpbc/scoop-solstone` then `scoop install solstone` (run `scoop update solstone` to update).
- **winget:** `winget install solstone` (run `winget upgrade solstone` to update).

signed by sol pbc. windows may show an "unknown publisher" or SmartScreen prompt while our signing reputation builds — expected for a new publisher; the signature is real.


## migrating from a python install

python package installs (`pip` / `pipx` / `uv tool` of `solstone-journal` / `solstone`) are retired. the journal now ships as a self-contained tree. follow [INSTALL.md](https://github.com/solpbc/solstone-journal/blob/main/INSTALL.md). your journal directory is unchanged.

## already have solstone installed?

install solstone on more of your devices at https://solstone.app/download.
