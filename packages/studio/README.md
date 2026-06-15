# @kaupang/studio

[![npm](https://img.shields.io/npm/v/@kaupang/studio.svg)](https://www.npmjs.com/package/@kaupang/studio)
[![license](https://img.shields.io/npm/l/@kaupang/studio.svg)](https://github.com/kaupang-dev/kaupang/blob/main/LICENSE)

> A small web UI to browse a [kaupang](https://github.com/kaupang-dev/kaupang) catalog,
> assemble environments + a solution, and **export a ready-to-run config**. Built with
> React + [React Flow](https://reactflow.dev) and bundled to a single self-contained
> page — no CDN, airgap-safe.

## Launch it

**With Node** (via the CLI):

```bash
npm i -g @kaupang/cli
kaupang studio --catalog ./catalog.json     # opens http://localhost:8080
```

**Without Node** (via Docker — great for polyglot teams):

```bash
docker run --rm -p 8080:8080 \
  -v "$PWD/catalog.json:/catalog.json" \
  -e KAUPANG_CATALOG=/catalog.json \
  ghcr.io/kaupang-dev/kaupang-studio
```

## What it does

1. **Load a catalog** — a `file`, `http(s)`, or `oci://` source.
2. **Assemble environments** from presets (override ports / env / depends-on).
3. **Compose a named solution** (which environments).
4. **Export** `kaupang.config.json` + `environments/*.json` — JSON configs need no Node,
   so anyone can run the result with `kaupang up <solution>`.

## Programmatic

```ts
import { startStudio } from "@kaupang/studio";

const { url, close } = await startStudio({ port: 8080, catalog: "./catalog.json" });
console.log(`studio on ${url}`);
```

## Develop the UI

The web UI is a Vite + React + React Flow app under [`web/`](./web). It's built to a
single inlined `web/dist/index.html`, which the package's `tsup` build embeds as a string
and the server serves at `/`.

```bash
kaupang studio --catalog ./catalog.json   # terminal 1: the API on :8080
npm run dev -w @kaupang/studio            # terminal 2: Vite dev server, proxies /api → :8080
npm run build -w @kaupang/studio          # build:web (Vite single-file) + tsup bundle
```

## License

MIT © Andreas Quist Batista
