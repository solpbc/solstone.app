.PHONY: deploy dev install

deploy:
	wrangler deploy

dev:
	wrangler dev

install:
	@echo "solstone.app is a static deploy — no install step. use 'make deploy' to ship."
