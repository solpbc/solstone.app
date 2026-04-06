# solstone installation guide

these instructions are for a coding agent and human working together. solstone is an AI life journal — it captures everything you see and hear on your computer, processes it with AI, and gives you superhuman memory. open source, made by sol pbc.

your data resides on your computer. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, the company can never be acquired. the code is open source — you can verify every claim.

**supported platforms:** linux (primary), macOS. windows is not yet supported.

## before you begin

check if solstone is already installed and running:

```bash
sol --version 2>&1 && sol service status 2>&1
```

if `sol` isn't found, try `~/.local/bin/sol`. if solstone is running and healthy, skip to [install an observer](#step-4----install-an-observer).

## step 1 — prerequisites

detect the platform and install what's needed. the only hard requirement is `uv` — the Makefile checks for it and errors with install instructions if it's missing.

```bash
uname -s
```

### linux

```bash
git --version 2>&1; uv --version 2>&1
```

if git or uv are missing:

**fedora / rhel:**
```bash
sudo dnf install git
```

**debian / ubuntu:**
```bash
sudo apt install git
```

**arch:**
```bash
sudo pacman -S git
```

install uv if not present:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### macOS

your human may need to handle a few interactive steps here — app store installs and password prompts.

**Xcode:** required for the macOS observer. check with `xcodebuild -version`. if missing, the human needs to install it from the Mac App Store, then:
```bash
xcode-select --install
```

**homebrew:** check with `brew --version`. if missing, the human installs from https://brew.sh.

```bash
brew install git uv
```

---

## step 2 — clone and install

the human should decide where solstone lives on their filesystem.

```bash
git clone https://github.com/solpbc/solstone.git
cd solstone
make install
```

`make install` sets up the python environment, installs all dependencies, and symlinks the `sol` command to `~/.local/bin/sol`.

if `sol` isn't in PATH after install, use `.venv/bin/sol` for now — the human can add `~/.local/bin` to their shell profile later.

---

## step 3 — start solstone

```bash
make install-service
```

this starts a background service (systemd on linux, launchd on macOS) with the web interface on port 5015.

let your human know: **open http://localhost:5015 in a browser.** the first-run setup wizard walks them through choosing a password, setting their identity, and connecting a Gemini API key. once they've completed it, solstone is configured and ready.

if the service fails to start, check `sol service logs`.

---

## step 4 — install an observer

solstone doesn't capture anything on its own — it needs an observer for the platform.

```bash
uname -s
```

clone the observer into solstone's observers directory and follow its INSTALL.md:

```bash
cd "$(sol root)/observers"
```

**linux:**
```bash
git clone https://github.com/solpbc/solstone-linux.git
```
then read `solstone-linux/INSTALL.md` and follow it.

**macOS:**
```bash
git clone https://github.com/solpbc/solstone-macos.git
```
then read `solstone-macos/INSTALL.md` and follow it.

---

## done

once the observer is running, solstone captures screen and audio continuously, transcribes conversations, extracts people and projects, builds a knowledge graph, and makes everything searchable through the web interface at http://localhost:5015. all data stays in `journal/` directories — one per day.

source code: https://github.com/solpbc/solstone
company: https://solpbc.org
