.PHONY: deploy dev install sitemap publish-install-sh

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

# Sibling checkout of solstone-journal; override with `make publish-install-sh JOURNAL_REPO=<path>`.
JOURNAL_REPO ?= ../solstone-journal

# The authoritative-installer publish step (req_impawibu, G20). Republishes
# solstone-journal's core/distribution/install.sh, from its origin/main tip
# only, to both live locations this repo/account own: public/install.sh
# (served at solstone.app/install.sh) and the updates.solstone.app
# compatibility alias. This IS the release procedure for install.sh -- a
# hand-run `wrangler r2 object put` for this file instead of this target is
# exactly the failure mode (G20) this exists to close. Run this whenever
# install.sh changes on solstone-journal main, and at every release cut.
publish-install-sh:
	@test -d "$(JOURNAL_REPO)" || { echo "solstone-journal checkout not found at $(JOURNAL_REPO); set JOURNAL_REPO=<path>" >&2; exit 1; }
	@cd "$(JOURNAL_REPO)" && git fetch origin --quiet
	@journal_head="$$(cd "$(JOURNAL_REPO)" && git rev-parse HEAD)"; \
	journal_main="$$(cd "$(JOURNAL_REPO)" && git rev-parse origin/main)"; \
	if [ "$$journal_head" != "$$journal_main" ]; then \
		echo "solstone-journal at $(JOURNAL_REPO) is at $$journal_head, not origin/main ($$journal_main); publishing must come from main" >&2; \
		exit 1; \
	fi
	@if [ -n "$$(cd "$(JOURNAL_REPO)" && git status --porcelain -- core/distribution/install.sh)" ]; then \
		echo "core/distribution/install.sh has uncommitted changes in $(JOURNAL_REPO); refusing to publish" >&2; \
		exit 1; \
	fi
	cp "$(JOURNAL_REPO)/core/distribution/install.sh" public/install.sh
	wrangler r2 object put solstone-updates/solstone-journal/install.sh \
		--file public/install.sh --content-type 'text/plain; charset=utf-8' --remote
	$(MAKE) deploy
	@journal_main="$$(cd "$(JOURNAL_REPO)" && git rev-parse origin/main)"; \
	echo "published install.sh (solstone-journal $$journal_main) to https://solstone.app/install.sh and https://updates.solstone.app/solstone-journal/install.sh"
	@echo "next: git add public/install.sh && git commit"
