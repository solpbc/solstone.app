# solstone installation guide

these instructions are for AI coding agents (claude code, codex cli, or similar) helping a human install solstone. if you are a human reading this directly, the steps still work -- but they are written for your agent to follow.

## what is solstone

solstone is an AI life journal. it captures everything you see and hear on your computer, processes it with AI, and gives you superhuman memory -- searchable conversations, automatic relationship tracking, knowledge graphs, and daily insights. open source, made by sol pbc.

your data resides on your computer. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, the company can never be acquired, and these terms are in the founding documents filed with the state of colorado -- not a privacy policy that can change. the code is open source -- you can verify every claim.

**supported platforms:** linux (primary), macOS. windows is not yet supported.

**requirements:** a Google AI Studio API key (Gemini) for transcription and vision processing.

---

## step 1 -- detect platform

```bash
uname -s
```

- `Linux` -- go to [step 2a: linux prerequisites](#step-2a--linux-prerequisites)
- `Darwin` -- go to [step 2b: macOS prerequisites](#step-2b--macos-prerequisites)
- anything else -- stop. tell your human that solstone only supports linux and macOS today. windows support is not yet available.

if linux, identify the distribution:

```bash
cat /etc/os-release | grep -E "^(ID|ID_LIKE)="
```

---

## step 2a -- linux prerequisites

check what is already installed:

```bash
python3 --version 2>&1; git --version 2>&1; ffmpeg -version 2>&1 | head -1; uv --version 2>&1; pipx --version 2>&1
```

**success:** python 3.10+, git, ffmpeg, uv, and pipx all produce version output. if any are missing or python is below 3.10, install below.

### system packages

these require `sudo`. if you do not have sudo access, ask your human to run these commands in their own terminal.

**fedora / rhel / centos stream:**

```bash
sudo dnf install python3 python3-gobject git ffmpeg pipewire pipewire-gstreamer pipewire-pulseaudio gstreamer1-plugins-base gtk4 alsa-lib-devel pulseaudio-utils pipx
```

**ubuntu / debian:**

```bash
sudo apt install python3 python3-gi git ffmpeg pipewire pipewire-pulse gstreamer1.0-pipewire gir1.2-gdk-4.0 gir1.2-gtk-4.0 libasound2-dev pulseaudio-utils pipx
```

**arch / manjaro:**

```bash
sudo pacman -S python python-gobject git ffmpeg pipewire pipewire-pulse gstreamer gtk4 alsa-lib python-pipx
```

**note:** if system packages were just installed, the new commands may not be in your current PATH. call them by their full path (e.g., `/usr/bin/python3 --version`) or run `hash -r` to refresh your shell's command cache.

### install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

after installing, uv will be at `~/.local/bin/uv` or `~/.cargo/bin/uv`. it may not be in your PATH yet -- you can call it directly by full path if needed.

### verify

```bash
python3 --version && git --version && ffmpeg -version 2>&1 | head -1 && uv --version && pipx --version
```

**success:** all five produce version output. python is 3.10 or later.

go to [step 3: clone and install](#step-3--clone-and-install).

---

## step 2b -- macOS prerequisites

several of these steps require human interaction -- permission dialogs, password prompts, and app store installs cannot be completed by an agent alone. guide your human through each one.

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

if not installed, ask your human to install it from https://brew.sh -- this requires their password and interactive confirmation.

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

## step 3 -- clone and install

```bash
git clone https://github.com/solpbc/solstone.git
cd solstone
make install
```

`make install` creates an isolated python virtual environment in `.venv/`, installs all dependencies, and symlinks the `sol` command to `~/.local/bin/sol`.

**success:** the output ends with a message about the `sol` command being installed. verify by calling sol directly -- the symlink at `~/.local/bin/sol` may not be in your PATH, so use the local binary:

```bash
.venv/bin/sol --help
```

for all remaining steps, use `.venv/bin/sol` if `sol` is not found in your PATH.

---

## step 4 -- configure

all configuration lives in `journal/config/journal.json`. create it:

```bash
mkdir -p journal/config
```

build the config with the following structure. you need to collect two things from your human:

1. **a Google AI Studio API key** -- they need to go to https://aistudio.google.com/apikey, sign in, create a key, and give it to you. this is required for transcription and vision processing.

2. **a password for the web interface** -- any password they will remember. this protects their journal's web UI on localhost.

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

## step 5 -- register observers

solstone's capture pipeline uses standalone observer apps that upload to the solstone server. register them now so you have the API keys for the observer installs in the next step.

on **linux**, register two observers (screen/audio + terminal):

```bash
.venv/bin/sol remote create solstone-linux
.venv/bin/sol remote create solstone-tmux
```

on **macOS**, register one observer (the native app handles screen/audio):

```bash
.venv/bin/sol remote create solstone-macos
```

each command prints an API key. **save them** -- you will need them in the next step. the server URL is `http://localhost:5015` (the default convey port).

---

## step 6 -- install platform observer

observers capture screen and audio and upload to the solstone server. each platform has its own observer.

### linux observers

linux uses two standalone observers: **solstone-linux** for screen and audio capture, and **solstone-tmux** for terminal session capture. install both.

#### solstone-linux (screen + audio)

```bash
pipx install --system-site-packages solstone-linux
```

the `--system-site-packages` flag is required because the observer uses PyGObject and GStreamer bindings that must come from system packages.

configure it with the server URL and API key from step 5. replace `HOSTNAME` with your machine's hostname (run `hostname` to check):

```bash
mkdir -p ~/.local/share/solstone-linux/config
```

write the config file at `~/.local/share/solstone-linux/config/config.json`:

```json
{
  "server_url": "http://localhost:5015",
  "key": "THE_SOLSTONE_LINUX_API_KEY_FROM_STEP_5",
  "stream": "HOSTNAME"
}
```

install and start the systemd user service:

```bash
solstone-linux install-service
```

**success:** `systemctl --user status solstone-linux` shows the service active and running.

#### solstone-tmux (terminal capture)

```bash
pipx install solstone-tmux
```

no `--system-site-packages` needed -- this is pure Python.

```bash
mkdir -p ~/.local/share/solstone-tmux/config
```

write the config file at `~/.local/share/solstone-tmux/config/config.json`:

```json
{
  "server_url": "http://localhost:5015",
  "key": "THE_SOLSTONE_TMUX_API_KEY_FROM_STEP_5",
  "stream": "HOSTNAME.tmux"
}
```

install and start the systemd user service:

```bash
solstone-tmux install-service
```

**success:** `systemctl --user status solstone-tmux` shows the service active and running.

#### verify both observers

```bash
.venv/bin/sol remote list
```

**success:** both `solstone-linux` and `solstone-tmux` show as `connected`.

go to [step 7: start solstone](#step-7--start-solstone).

### macOS observer

on macOS, solstone uses a native app for screen and audio capture. build and install it:

```bash
cd ..
git clone https://github.com/solpbc/solstone-macos.git
cd solstone-macos
make install
```

this builds and installs the SolstoneCapture app to `/Applications`. open it:

```bash
open /Applications/SolstoneCapture.app
```

the app will show a setup screen on first launch. tell your human to:

1. enter the **server URL**: `http://localhost:5015`
2. enter the **API key** from step 5
3. approve the **screen recording** and **microphone** permission prompts that macOS shows

the app runs as a menu bar icon and captures in the background.

return to the solstone directory for the remaining steps:

```bash
cd ../solstone
```

go to [step 7: start solstone](#step-7--start-solstone).

---

## step 7 -- start solstone

install solstone as a background service:

```bash
make install-service
```

this installs, enables, and starts a systemd user service (linux) or launchd agent (macOS) with the web interface on port 5015.

verify everything is running:

```bash
.venv/bin/sol service status
```

then open the web interface:

```bash
.venv/bin/sol health
```

**success:** `sol service status` shows the service running. `sol health` shows healthy services. the web interface is available at `http://localhost:5015`.

if the service fails to start, check the logs:

```bash
.venv/bin/sol service logs
```

common causes are a missing or invalid API key, missing system dependencies (pipewire/gstreamer on linux), or permission issues.

---

## step 8 -- hand off to the human

solstone is installed and running as a background service. tell your human:

1. **solstone is running** as a background service that starts automatically on login. they can manage it with:
   ```
   sol service status    # check if running
   sol service restart   # restart
   sol service stop      # stop
   sol service logs -f   # follow logs
   ```
   (or use `.venv/bin/sol` if `sol` is not in their PATH -- they can add `~/.local/bin` to their PATH in their shell profile to fix this permanently)

2. **the web interface** is at `http://localhost:5015`. open it in a browser and log in with the password they chose.

3. **after logging in**, they should go to Settings (gear icon) and fill in their identity -- name, preferred name, pronouns, timezone. this helps solstone identify them in transcripts and personalize AI responses.

4. **on macOS**, the SolstoneCapture menu bar app handles screen and audio recording. it should be running alongside the solstone service (it shows as a menu bar icon).

5. **on linux**, two observer services run alongside the main solstone service:
      - `systemctl --user status solstone-linux` -- screen and audio capture
      - `systemctl --user status solstone-tmux` -- terminal session capture
      - `sol remote list` -- shows both observers and their sync status

6. **what solstone does from here:** it captures screen and audio continuously, transcribes conversations, extracts people and projects, builds a knowledge graph, and makes everything searchable through the web interface. all data stays in `journal/` directories inside the solstone folder -- one directory per day.

source code: https://github.com/solpbc/solstone
company: https://solpbc.org
