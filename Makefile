.PHONY: deploy dev install sitemap publish-install-sh check-install-sh-served build-install-sh

# `deploy` regenerates the sitemap first so <lastmod> can never drift from the
# pages' real last-modified dates (see scripts/gen-sitemap.mjs).
deploy: sitemap
	wrangler deploy

dev:
	wrangler dev

sitemap:
	node scripts/gen-sitemap.mjs

install:
	@echo "solstone.app is a static deploy — no install step. use 'make deploy' to ship."

# Sibling checkout of the cross-platform installer; override with
# `make publish-install-sh SOLSTONE_REPO=<path>`.
SOLSTONE_REPO ?= ../solstone
SOLSTONE_REMOTE ?= origin

# Build both public installer paths from an exact, clean public main. The
# platform-install.sh path remains a byte-identical compatibility URL.
build-install-sh:
	@test -d "$(SOLSTONE_REPO)" || { echo "solstone checkout not found at $(SOLSTONE_REPO); set SOLSTONE_REPO=<path>" >&2; exit 1; }
	@cd "$(SOLSTONE_REPO)" && git fetch "$(SOLSTONE_REMOTE)" main --quiet
	@solstone_head="$$(cd "$(SOLSTONE_REPO)" && git rev-parse HEAD)"; \
	solstone_main="$$(cd "$(SOLSTONE_REPO)" && git rev-parse FETCH_HEAD)"; \
	if [ "$$solstone_head" != "$$solstone_main" ]; then \
		echo "solstone at $(SOLSTONE_REPO) is at $$solstone_head, not $(SOLSTONE_REMOTE)/main ($$solstone_main); publishing must come from main" >&2; \
		exit 1; \
	fi
	@if [ -n "$$(cd "$(SOLSTONE_REPO)" && git status --porcelain)" ]; then \
		echo "solstone checkout at $(SOLSTONE_REPO) has uncommitted changes; refusing to publish" >&2; \
		exit 1; \
	fi
	$(MAKE) -C "$(SOLSTONE_REPO)" build-installer
	cp "$(SOLSTONE_REPO)/dist/install.sh" public/install.sh
	cp "$(SOLSTONE_REPO)/dist/install.sh" public/platform-install.sh

# The authoritative installer publish step. Both public paths come from the
# cross-platform installer on solstone main. The Journal bootstrap remains an
# independent Linux release artifact on updates.solstone.app; this target never
# republishes it or presents it as a macOS installation path.
publish-install-sh: build-install-sh
	$(MAKE) deploy
	node scripts/check-install-sh-served.mjs --solstone-repo "$(SOLSTONE_REPO)" --wait 90
	@solstone_main="$$(cd "$(SOLSTONE_REPO)" && git rev-parse FETCH_HEAD)"; \
	echo "published install.sh (solstone $$solstone_main) to https://solstone.app/install.sh and https://solstone.app/platform-install.sh"
	@echo "next: git add public/install.sh public/platform-install.sh && git commit"

# The served-bytes gate: fails unless both public paths equal the installer
# generated from solstone origin/main. It is networked and cross-repo, so it is
# reachable by name rather than part of the ordinary site test suite.
check-install-sh-served:
	node scripts/check-install-sh-served.mjs --solstone-repo "$(SOLSTONE_REPO)"
