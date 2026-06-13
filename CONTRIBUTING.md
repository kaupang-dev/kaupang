# Contributing to kaupang

Thanks for your interest! kaupang is an **npm-workspaces monorepo** with two published
packages:

- **`@kaupang/core`** (`packages/core`) — the engine + config-authoring API.
- **`@kaupang/cli`** (`packages/cli`) — the `kaupang` binary; depends on core.

## Setup

```bash
npm install        # links the workspaces
npm run build      # builds @kaupang/core, then @kaupang/cli
npm run typecheck  # tsc --noEmit in both packages
npm test           # the Vitest suite (offline — no Docker daemon needed)
```

Node 20+ is required for the toolchain (the published CLI runtime supports Node ≥ 18).

## Running the CLI from source

```bash
npm run dev -- up web --dry-run --cwd examples/minimal   # via jiti, from source
node packages/cli/dist/cli.js up web --cwd examples/minimal   # the built binary
```

There's an [`examples/`](examples/) gallery — one concept per folder — and a flagship
`examples/longhall/`.

## Tests

- **Unit + execution seam** (`packages/core/test`, `npm test`): pure logic plus the
  deploy/pipeline layers driven by an injected fake `Executor`. Fully offline. Please
  add or adjust tests alongside your change.
- **Integration** (`scripts/integration-*.sh`): real Docker — compose, build, swarm,
  oras, and Kubernetes (kind). Run a leg locally with Docker, e.g.
  `bash scripts/integration-compose.sh`. They also run in CI on PRs.

## Architecture guardrails (please preserve)

- **The materialize seam is sacred.** `backend.materialize()` returns *data* (files +
  actions) with **no side effects**; a separate layer executes them. This is what makes
  the tool testable.
- **The execution seam.** `deployPlan` / `runPipeline` / `runHooks` run commands through
  an injected `Executor` — don't shell out directly from those layers.
- **One shared deploy path.** Both `up` and pipeline up-steps go through `deployPlan` —
  extend it, don't duplicate the loop.
- **Secrets never hit disk.** `secret()` emits `${VAR}` (compose/swarm) or a
  `secretKeyRef` (k8s) — never the value.

## Pull requests

- Branch from `main` and keep PRs focused.
- `npm run typecheck`, `npm test`, and `npm run build` must pass. CI runs these plus an
  example dry-run matrix; the integration workflow runs the Docker legs.
- Clear, descriptive commit messages are appreciated.

## Versioning & releases

Both packages are versioned in **lockstep**. A release is cut by pushing a `v*` tag
(e.g. `v0.1.0`): the release workflow checks both `package.json` versions match the tag,
then publishes `@kaupang/core` followed by `@kaupang/cli` with provenance.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
