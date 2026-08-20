---
name: solstone-install
description: install and configure solstone, a personal memory platform. the solstone app takes in what you share with it, and all of it goes into your journal. when asked to install solstone, set up solstone, or when someone mentions solstone.app. linux (x86_64 and aarch64) and macos on apple silicon.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.1"
  website: https://solstone.app
  repository: https://github.com/solpbc/solstone-journal
---

# solstone installation

these instructions are for a coding agent and human working together. solstone is a personal memory platform. the solstone app takes in what you share with it, and all of it goes into your journal. your journal is always private, only yours. open source, made by sol pbc.

sol pbc is a public benefit corporation. the data covenants in its articles of incorporation can't be amended without the founder's personal signature, and after the founder the language can only get stronger, never weaker. any acquisition is conditional: the successor must be legally bound to preserve a substantially equivalent benefit purpose and assume covenants no less protective than article 8.

## instructions

fetch the install guide and follow it step by step:

```
https://github.com/solpbc/solstone-journal/blob/main/INSTALL.md
```

the guide covers platforms, prerequisites, installation, setup, service verification, installing the solstone app on other devices, and human handoff.

## quick reference

- **repo:** https://github.com/solpbc/solstone-journal
- **solstone app (mac):** https://github.com/solpbc/solstone-macos
- **platforms:** linux (x86_64 and aarch64) and macos on apple silicon. the journal does not live on windows. a windows owner needs a mac or linux machine where the journal lives.
- **requires:** no interpreter and no package manager of its own. on linux, the system OpenMP runtime (`libgomp`) for the default local transcription helper. the signed solstone app is a separate install from the journal.
- **the two CLIs:** `solstone` and `journal`. one tree puts both on PATH. there is no thin-client package, no `sol` command, and no alias. the solstone app on each device is a separate install.
- **install the journal:** the tree is not published yet. its release channel is `updates.solstone.app`. until the first release lands there, start from a local build or a copy someone handed you, and follow INSTALL.md. once it is published, one command does the whole thing: `sh install.sh` (or `sh core/distribution/install.sh` from a checkout). that follows the `release` lane, verifies the digest, and installs. debian and fedora can install the `.deb` or `.rpm` instead. then run `journal setup`.
- **install from archives already on disk:** `sh core/distribution/install.sh --archive solstone-journal-<version>-linux-x86_64.tar.gz --sha256 solstone-journal-<version>-linux-x86_64.sha256 --release solstone-journal-<version>-linux-x86_64.release` (use `macos-arm64` on apple silicon). then `journal setup`.
- **moving from a pip, uv, or pipx install:** stop the old service (`journal service stop`), uninstall the old Python packages, then install the tree. INSTALL.md has the exact uninstall commands. the two must not both be on PATH.
- **configure:** open http://localhost:5015 after setup. the first-run wizard handles identity.
- **docs:** https://solstone.app/llms.txt
