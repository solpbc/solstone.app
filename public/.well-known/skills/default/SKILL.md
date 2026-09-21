---
name: solstone-install
description: install and configure solstone, a personal memory platform. the solstone app takes in what you share with it, and all of it goes into your journal. when asked to install solstone, set up solstone, or when someone mentions solstone.app. linux (x86_64 and aarch64) and macos on apple silicon.
license: AGPL-3.0-only
metadata:
  author: sol-pbc
  version: "1.2"
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
- **platforms:** linux (x86_64 and aarch64) and macos 15 or later on Apple Silicon. the journal does not live on windows. a windows owner needs a mac or linux machine where the journal lives.
- **linux:** the journal ships as one self-contained tree with no interpreter or package manager of its own. the tree puts `solstone` and `journal` on PATH and needs the system OpenMP runtime (`libgomp`) for the default local transcription helper.
- **mac:** the journal app is the only supported way to run the journal. it does not install a second command-line runtime, PATH wrapper, or launchd service. the journal app and solstone app are separate apps and each handles its own updates.
- **install on linux:** `curl -fsSL https://solstone.app/install.sh | sh`, then `journal setup`. the installer verifies the signed release and its digests. Debian and Fedora can install the `.deb` or `.rpm` instead.
- **install on mac:** `curl -fsSL https://solstone.app/install.sh | sh -s -- --components journal`. use `--components all` to install both mac apps. the installer verifies the signed, notarized bundles and puts them in `/Applications`.
- **install from archives already on disk:** linux only. use `sh core/distribution/install.sh --archive solstone-journal-<version>-linux-x86_64.tar.gz --sha256 solstone-journal-<version>-linux-x86_64.sha256 --release solstone-journal-<version>-linux-x86_64.release`, then `journal setup`.
- **moving from a pip, uv, or pipx install on linux:** do not stop or uninstall the old runtime first. install the tree, then let the applicable `journal setup` command recognize and replace the old service and launchers while preserving the journal. INSTALL.md carries the v1.0.22 package exception.
- **moving from an older command-line install on mac:** install the journal app and open it. the journal app adopts the existing journal only when it can verify the installation it is taking over. if anything is unclear, it stops and tells the owner what needs attention. the journal stays where it is; see https://solstone.app/install#macos-migration.
- **configure:** on linux, open http://localhost:5015 after setup. on mac, open the journal app and follow first run.
- **docs:** https://solstone.app/llms.txt
