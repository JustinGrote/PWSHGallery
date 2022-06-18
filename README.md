# Miniflare Example Project

This is an example [Cloudflare Workers](https://workers.cloudflare.com/) project that uses [Miniflare](https://github.com/cloudflare/miniflare) for local development, [TypeScript](https://www.typescriptlang.org/), [esbuild](https://github.com/evanw/esbuild) for bundling, and [Jest](https://jestjs.io/) for testing, with [Miniflare's custom Jest environment](https://miniflare.dev/testing/jest).

```shell
# Install dependencies
$ pnpm install
# Start local development server with live reload
$ pnpm run dev
# Start remote development server using wrangler
$ pnpm run dev:remote
# Run tests
$ pnpm test
# Run type checking
$ pnpm run types:check
# Deploy using wrangler
$ pnpm run deploy
```
