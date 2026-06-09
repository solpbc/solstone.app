.PHONY: deploy dev install sitemap

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
