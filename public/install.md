# solstone installation guide

solstone is your co-brain — your observers experience your day along with you, sol curates your memories, and your journal holds everything. open source, made by sol pbc.

your data stays on your machine. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, and any acquisition is conditional on the successor being legally bound to preserve the benefit purpose.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar: `install solstone from https://solstone.app/install`

## install yourself

### macOS

**1. install the native observer app**

[download for macOS](https://solstone.app/download/macos) — signed by sol pbc, notarized by Apple. updates over a signed channel.

**2. install the sol agent (service)**

prereqs: xcode command-line tools (`xcode-select --install`), homebrew (https://brew.sh), then `brew install uv`.

```bash
uv tool install solstone
sol setup
```

(or `pipx install solstone && sol setup` if you prefer pipx.)

note for macOS Apple Silicon users: the CoreML-accelerated transcription path requires a source-checkout install — see [CONTRIBUTING.md](https://github.com/solpbc/solstone/blob/main/CONTRIBUTING.md). the packaged install runs the on-disk ONNX path instead, which is also fast.

then open http://localhost:5015 in a browser. the first-run wizard sets your password and confirms the journal location at `~/journal`. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting.

### linux

prereqs: `uv` from astral.sh: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

```bash
uv tool install solstone
sol setup
```

(or `pipx install solstone && sol setup` if you prefer pipx.)

then open http://localhost:5015 in a browser. the first-run wizard sets your password and confirms the journal location at `~/journal`. see [INSTALL.md](https://github.com/solpbc/solstone/blob/main/INSTALL.md) for full details and troubleshooting. for a linux observer, see [solstone.app/observers](https://solstone.app/observers).

## already have your sol agent installed?

find available observers at https://solstone.app/observers.
