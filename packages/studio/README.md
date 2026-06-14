# @kaupang/studio

[![npm](https://img.shields.io/npm/v/@kaupang/studio.svg)](https://www.npmjs.com/package/@kaupang/studio)
[![license](https://img.shields.io/npm/l/@kaupang/studio.svg)](https://github.com/kaupang-dev/kaupang/blob/main/LICENSE)

> A small web UI to browse a [kaupang](https://github.com/kaupang-dev/kaupang) catalog,
> assemble environments + a solution, and **export a ready-to-run config**. No framework,
> no CDN — a single self-contained page.

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

## License

MIT © Andreas Quist Batista
