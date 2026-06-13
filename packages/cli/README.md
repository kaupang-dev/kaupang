# @kaupang/cli

[![npm](https://img.shields.io/npm/v/@kaupang/cli.svg)](https://www.npmjs.com/package/@kaupang/cli)
[![CI](https://github.com/kaupang-dev/kaupang/actions/workflows/ci.yml/badge.svg)](https://github.com/kaupang-dev/kaupang/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@kaupang/cli.svg)](https://github.com/kaupang-dev/kaupang/blob/main/LICENSE)

> The **`kaupang`** CLI — spin up environments on Docker Compose, Docker Swarm, or
> Kubernetes from a single config, the same command on your laptop and in CI.

kaupang is an imperative, push-based deploy tool — an *environment maker*, not a
reconciler. You run it, it makes a target match your config, records exactly what it
did, and lets you replay or roll back. No control loop, no cluster agent.

## Install

```bash
npm install -g @kaupang/cli          # installs the `kaupang` command
# or run without installing:
npx @kaupang/cli up api --target staging
```

## Quick start

Create a `kaupang.config.ts` at your repo root and an `environments/` folder:

```ts
// kaupang.config.ts
import { defineConfig } from "@kaupang/core";

export default defineConfig({
  environments: "./environments",
  project: "shop",
  dockerRepository: "ghcr.io/acme",
});
```

```ts
// environments/api.ts
import { defineEnvironment } from "@kaupang/core";

export default defineEnvironment({
  services: {
    web: { image: "shop-api", ports: ["8080:3000"] },
  },
});
```

Then:

```bash
kaupang up api               # resolve images → pin digests → deploy → record
kaupang up api --dry-run     # show the dependency graph + commands, run nothing
kaupang down api             # tear it down
kaupang rollback api         # re-apply the previous good deployment
```

The authoring helpers (`defineConfig`, `defineEnvironment`, `secret`, `use`, …) come
from [`@kaupang/core`](https://www.npmjs.com/package/@kaupang/core), which this package
depends on.

## Commands

| Command | What it does |
| --- | --- |
| `kaupang up <env \| --solution \| --bundle>` | Deploy to a target |
| `kaupang down <env>` | Tear down (optionally `--with-deps`) |
| `kaupang build <env> [--push]` | Build (and push) images |
| `kaupang bundle <solution> [--push oci://…]` | Pack a portable, pinned bundle |
| `kaupang rollback <env> [--to <id>]` | Re-apply a recorded deployment |
| `kaupang run <pipeline>` | Run a pipeline (run / up / down / build / wait steps) |

Add `--dry-run` to preview without touching anything, and `-v` / `--verbose` to print the
underlying `docker`/`kubectl` commands.

## Docs

Full documentation — config, catalog presets, targets, solutions & bundles, pipelines,
secrets, backends, Azure DevOps — lives in the
[project README](https://github.com/kaupang-dev/kaupang#readme).

## License

MIT © Andreas Quist Batista
