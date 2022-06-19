# Miniflare Example Project

This is an example [Cloudflare Workers](https://workers.cloudflare.com/) project that uses:

* [Miniflare](https://github.com/cloudflare/miniflare) for local development
* [ES Module](https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/) Worker Syntax
* [TypeScript](https://www.typescriptlang.org/)
* [esbuild](https://github.com/evanw/esbuild) for bundling
* [Jest](https://jestjs.io/) for testing, with [Miniflare's custom Jest environment](https://miniflare.dev/testing/jest).
* [pnpm](https://pnpm.io/) as a faster npm alternative
* [nvs](https://github.com/jasongin/nvs) as a cross-platform alternative to nvm for switching NodeJS versions, since Cloudflare requires very new versions of nodejs.

It also uses

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
