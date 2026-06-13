# @kaupang/core

[![npm](https://img.shields.io/npm/v/@kaupang/core.svg)](https://www.npmjs.com/package/@kaupang/core)
[![license](https://img.shields.io/npm/l/@kaupang/core.svg)](https://github.com/kaupang-dev/kaupang/blob/main/LICENSE)

> The engine + config-authoring API behind
> [kaupang](https://github.com/kaupang-dev/kaupang).
> **Most people want the CLI:** [`@kaupang/cli`](https://www.npmjs.com/package/@kaupang/cli)
> (`npm i -g @kaupang/cli`).

This package provides the typed helpers you use to author a kaupang config — you import
it in your `kaupang.config.ts` and environment files:

```ts
import { defineConfig, defineEnvironment, secret, use } from "@kaupang/core";
```

- `defineConfig(config)` / `defineEnvironment(env)` — identity helpers with full
  type-checking + autocomplete.
- `secret("VAR")` — a value resolved from the environment at deploy time, never written
  to the generated artifact or the ledger.
- `use("preset", overrides?)` — reference a shared catalog preset.
- `defineSolution` / `definePipeline` / `defineService` — for solutions, pipelines, and
  reusable service specs.
- All config **types** (`KaupangConfig`, `ServiceSpec`, `EnvironmentDefinition`, …).

You don't import this to *run* deploys — that's the CLI's job; `@kaupang/cli` depends on
it. It ships as a normal dependency so your config files resolve the helpers and types.

> An engine surface is also exposed under `@kaupang/core/internal`, but that subpath is
> **internal** — consumed by `@kaupang/cli`, not part of the stable public API.

## Docs

See the [project README](https://github.com/kaupang-dev/kaupang#readme).

## License

MIT © Andreas Quist Batista
