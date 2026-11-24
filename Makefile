.PHONY: deploy render render-dev i18n-dev check dev install sitemap sunarc stamp brand sbis dayground publish-install-sh check-install-sh-served build-install-sh

# `deploy` regenerates the sitemap first so <lastmod> can never drift from the
# pages' real last-modified dates (see scripts/gen-sitemap.mjs).
deploy: sitemap sunarc
	node i18n/update.mjs --check
	node scripts/stamp-assets.mjs --check
	node scripts/render-website.mjs --check
	wrangler deploy

render:
	node scripts/render-website.mjs

i18n-dev:
	node i18n/update.mjs --write-dev

render-dev: i18n-dev
	node scripts/render-website.mjs --out .dev-site

check:
	node i18n/update.mjs --check
	node scripts/stamp-assets.mjs --check
	node scripts/render-website.mjs --check
	node --test test/*.test.js

dev:
	wrangler dev

sitemap:
	node scripts/gen-sitemap.mjs

# The marketing pages' sun-arc script is generated from the services portal's
# engine, so the two surfaces run one implementation.
sunarc:
	node scripts/gen-sunarc.mjs

# Every /static/ reference carries its file's content hash, so /static/* is
# cached as immutable. Run after changing anything under public/static, then
# commit the stamped pages; `make deploy` refuses a stale stamp.
stamp:
	node scripts/render-website.mjs
	node scripts/stamp-assets.mjs
	node scripts/render-website.mjs

# The /brand downloads (public/brand/assets/) are generated from the brand
# source and committed. This is an explicit step and `deploy` never runs it,
# so an unrelated deploy can't republish a mark. Review and commit the diff.
#   make brand BRAND_SRC=/abs/path/to/brand-source
brand:
	./scripts/gen-brand-assets.sh

# The drawings on /brand/system and /brand/merch are generated from the brand
# source's kernel and pattern modules (read by reference, never copied) and
# committed, like the downloads. `deploy` never runs it. Review and commit.
#   make sbis BRAND_SRC=/abs/path/to/brand-source
sbis:
	node scripts/gen-sbis.mjs
	node scripts/render-website.mjs

# /brand/dayground's files (the engine as one module, its worked numbers, the page's
# words as markdown and on the page) are generated from the services portal's engine
# and scripts/dayground/dayground.src.md, then committed. `deploy` never regenerates
# them; it refuses to ship a stale copy. Run this, then `make stamp`, review, commit.
dayground:
	node scripts/gen-dayground.mjs

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
