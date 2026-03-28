# solstone.app

Product site for [solstone](https://github.com/solpbc/solstone), served via Cloudflare Workers.

## Deploy

```bash
make deploy
```

## Develop

```bash
make dev
```

## Structure

```
public/          static assets served by CF Workers
├── index.html   landing page
└── static/      logo and screenshots
```
