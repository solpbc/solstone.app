# solstone installation guide

these instructions are for a coding agent and human working together. solstone is an AI life journal — it experiences everything you see and hear on your computer, processes it with AI, and gives you superhuman memory. open source, local-first, linux and macOS.

your data stays on your machine. sol pbc is a public benefit corporation with irrevocable legal covenants: your data can never be sold, the company can never be acquired.

## install with a coding agent

paste this prompt into claude code, codex cli, gemini cli, or similar.

solstone is a system, three named parts:
- observers experience your screen and audio along with you
- sol agent processes everything and curates your memories
- the journal holds your memories

```
git clone https://github.com/solpbc/solstone.git
```

then read INSTALL.md in the cloned repo and follow it.

## install yourself

### macOS

prereqs: xcode command-line tools (`xcode-select --install`), homebrew (https://brew.sh), then:

```
brew install git uv
```

install:

```
git clone https://github.com/solpbc/solstone.git
cd solstone
make install
make install-service
```

then open http://localhost:5015 in a browser. the first-run wizard sets your password and confirms the journal location at `~/Documents/journal`.

### linux

prereqs: git from your distro's package manager, `uv` from astral.sh:

```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

install:

```
git clone https://github.com/solpbc/solstone.git
cd solstone
make install
make install-service
```

then open http://localhost:5015 in a browser. the first-run wizard sets your password and confirms the journal location at `~/Documents/journal`.

## already have your sol agent installed?

find available observers at https://solstone.app/observers.
