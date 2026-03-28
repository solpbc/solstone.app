# solstone installation guide

these instructions are for AI coding agents (claude code, codex cli, or similar) helping a human install solstone. if you are a human reading this directly, the steps still work — but they are written for your agent to follow.

## what is solstone

solstone is an AI life journal. it captures everything you see and hear on your computer, processes it with AI, and gives you superhuman memory — searchable conversations, automatic relationship tracking, knowledge graphs, and daily insights. open source, made by sol pbc.

your data resides on your computer. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, the company can never be acquired, and these terms are in the founding documents filed with the state of colorado — not a privacy policy that can change. the code is open source — you can verify every claim.

**supported platforms:** linux (primary), macOS. windows is not yet supported.

**requirements:** a Google AI Studio API key (Gemini) for transcription and vision processing.

---

## step 1 — detect platform

```bash
uname -s
```

- `Linux` — go to [step 2a: linux prerequisites](#step-2a--linux-prerequisites)
- `Darwin` — go to [step 2b: macOS prerequisites](#step-2b--macos-prerequisites)
- anything else — stop. tell your human that solstone only supports linux and macOS today. windows support is not yet available.

if linux, identify the distribution:

```bash
cat /etc/os-release | grep -E "^(ID|ID_LIKE)="
```

---

## step 2a — linux prerequisites

check what is already installed:

```bash
python3 --version 2>&1; git --version 2>&1; ffmpeg -version 2>&1 | head -1; uv --version 2>&1
```

**success:** python 3.10+, git, ffmpeg, and uv all produce version output. if any are missing or python is below 3.10, install below.

### system packages

these require `sudo`. if you do not have sudo access, ask your human to run these commands in their own terminal.

**fedora / rhel / centos stream:**

```bash
sudo dnf install python3 git ffmpeg pipewire gstreamer1-plugins-base
```

**ubuntu / debian:**

```bash
sudo apt install python3 git ffmpeg pipewire gstreamer1.0-tools
```

**arch / manjaro:**

```bash
sudo pacman -S python git ffmpeg pipewire gstreamer
```

**note:** if system packages were just installed, the new commands may not be in your current PATH. call them by their full path (e.g., `/usr/bin/python3 --version`) or run `hash -r` to refresh your shell's command cache.

### install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

after installing, uv will be at `~/.local/bin/uv` or `~/.cargo/bin/uv`. it may not be in your PATH yet — you can call it directly by full path if needed.

### verify

```bash
python3 --version && git --version && ffmpeg -version 2>&1 | head -1 && uv --version
```

**success:** all four produce version output. python is 3.10 or later.

go to [step 3: clone and install](#step-3--clone-and-install).

---

## step 2b — macOS prerequisites

several of these steps require human interaction — permission dialogs, password prompts, and app store installs cannot be completed by an agent alone. guide your human through each one.

### xcode command line tools

```bash
xcode-select --install
```

this opens a system dialog the human must click through. if already installed, the command reports that and you can continue.

### homebrew

check if brew is installed:

```bash
brew --version 2>&1
```

if not installed, ask your human to install it from https://brew.sh — this requires their password and interactive confirmation.

### brew packages

```bash
brew install python git ffmpeg uv
```

### verify

```bash
python3 --version && git --version && ffmpeg -version 2>&1 | head -1 && uv --version
```

**success:** all four produce version output. python is 3.10 or later.

go to [step 3: clone and install](#step-3--clone-and-install).

---

## step 3 — clone and install

```bash
git clone https://github.com/solpbc/solstone.git
cd solstone
make install
```

`make install` creates an isolated python virtual environment in `.venv/`, installs all dependencies, and symlinks the `sol` command to `~/.local/bin/sol`.

**success:** the output ends with a message about the `sol` command being installed. verify by calling sol directly — the symlink at `~/.local/bin/sol` may not be in your PATH, so use the local binary:

```bash
./solstone/.venv/bin/sol --help
```

or if you are already inside the solstone directory:

```bash
.venv/bin/sol --help
```

for all remaining steps, use `.venv/bin/sol` if `sol` is not found in your PATH.

---

## step 3b — macOS native capture app

on macOS, solstone uses a native app for screen and audio capture. install it:

```bash
cd ..
git clone https://github.com/solpbc/solstone-macos.git
cd solstone-macos
make install
```

this builds and installs the SolstoneCapture app to `/Applications`. after install, open it:

```bash
open /Applications/SolstoneCapture.app
```

macOS will show permission prompts for screen recording and microphone access — your human must approve these in the system dialogs that appear. the app runs as a menu bar icon and captures in the background.

return to the solstone directory for the remaining steps:

```bash
cd ../solstone
```

---

## step 4 — configure

all configuration lives in `journal/config/journal.json`. create it:

```bash
mkdir -p journal/config
```

build the config with the following structure. you need to collect two things from your human:

1. **a Google AI Studio API key** — they need to go to https://aistudio.google.com/apikey, sign in, create a key, and give it to you. this is required for transcription and vision processing.

2. **a password for the web interface** — any password they will remember. this protects their journal's web UI on localhost.

write the config file:

```json
{
  "convey": {
    "password": "THE_PASSWORD_THEY_CHOSE"
  },
  "env": {
    "GOOGLE_API_KEY": "THE_GEMINI_KEY_THEY_PROVIDED"
  }
}
```

### add your own provider key

if you are an AI agent with access to an API key for your own platform, you should also add it to the `env` section so solstone can use your provider for chat and agent features. confirm with your human before adding their key.

- if you are claude code or have an anthropic key: add `"ANTHROPIC_API_KEY": "the-key"`
- if you are codex or have an openai key: add `"OPENAI_API_KEY": "the-key"`

example with both gemini and anthropic:

```json
{
  "convey": {
    "password": "THE_PASSWORD"
  },
  "env": {
    "GOOGLE_API_KEY": "the-gemini-key",
    "ANTHROPIC_API_KEY": "the-anthropic-key"
  }
}
```

write the final config to `journal/config/journal.json`.

**success:** `cat journal/config/journal.json` shows the config with real keys (not placeholders) and a real password.

---

## step 5 — verify startup

run the supervisor in verbose mode briefly to confirm everything starts cleanly:

```bash
timeout 10 .venv/bin/sol supervisor -v || true
```

**success:** the output shows services starting (observer, sense, callosum) and a web interface URL (like `http://localhost:NNNNN`) with no errors or crashes. some warnings are normal on first run.

if the supervisor errors on startup, read the output carefully — common causes are a missing or invalid API key, missing system dependencies (pipewire/gstreamer on linux), or permission issues.

---

## step 6 — hand off to the human

solstone is installed and configured. tell your human:

1. **to start solstone**, open a terminal, go to the solstone directory, and run:
   ```
   sol supervisor
   ```
   (or `.venv/bin/sol supervisor` if `sol` is not in their PATH — they can add `~/.local/bin` to their PATH in their shell profile to fix this permanently)

2. **the web interface** will show a URL when the supervisor starts. open that URL in a browser and log in with the password they chose.

3. **after logging in**, they should go to Settings (gear icon) and fill in their identity — name, preferred name, pronouns, timezone. this helps solstone identify them in transcripts and personalize AI responses.

4. **solstone runs in the foreground** in that terminal. to stop it, Ctrl+C. to run it in the background, they can use `nohup sol supervisor &` or run it in a tmux/screen session.

5. **on macOS**, the SolstoneCapture menu bar app handles screen and audio recording. it should be running alongside the supervisor.

6. **what solstone does from here:** it captures screen and audio continuously, transcribes conversations, extracts people and projects, builds a knowledge graph, and makes everything searchable through the web interface. all data stays in `journal/` directories inside the solstone folder — one directory per day.

source code: https://github.com/solpbc/solstone
company: https://solpbc.org
