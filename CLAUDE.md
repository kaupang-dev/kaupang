# CLAUDE.md — working context for kaupang

This file is read automatically by Claude Code. It is the institutional knowledge
that isn't obvious from the source alone: the philosophy, conventions, decisions,
and — most importantly — **what has and hasn't been verified**. Read it before
making changes.

---

## What kaupang is

**kaupang** (Old Norse for a Viking-age *trading hub*) is an imperative, push-based
deploy CLI written in TypeScript. You point it at a config, it makes a target match
that config, records exactly what it did, and lets you replay or roll back. It
deploys the same definitions to **Docker Compose, Docker Swarm, or Kubernetes**.

### Core philosophy (these are deliberate; don't "fix" them into a reconciler)
- **Push tool / "environment maker", NOT a reconciler.** No control loop, no agent,
  no drift detection. Run it → it acts once → it exits. (This is the opposite of
  Argo/Flux, and intentionally so.)
- **Lean on native tools via execa.** Shell out to `docker`, `kubectl`, `oras`.
  Never reimplement a registry client, a context manager, or a compose engine.
- **Local/CI parity.** The same command and config run identically on a laptop and
  on a CI agent; only the ambient target (context, env, secrets) differs.
- **"Resolve once, pin, make portable, replay"** applied at every layer: images →
  digests; config → bundles; solutions → recorded artifacts.
- **Compose, don't compete, with CI.** kaupang owns the portable deploy recipe;
  Azure Pipelines / GitHub Actions own triggers, approvals, and secrets.

---

## ⚠️ Verification status — READ THIS FIRST

The single most important thing to know: **the daemon/registry-dependent paths have
never been run against real infrastructure.** Development happened in a sandbox with
no Docker daemon, no external registry, and restricted network.

**Tested and trusted:**
- `tsc --noEmit` typechecks clean; `tsup` builds clean.
- **Vitest suite (`npm test`, 120 tests in `test/`)** covering the pure logic below
  **plus the execution seam** — runs fully offline, no daemon/registry. `npm run
  coverage` for the report (pure-logic + deploy/pipeline layers are high, the
  remaining gaps are the live IO calls the integration job covers).
- **Compose integration — VERIFIED live.** `scripts/integration-compose.sh` (run by
  `.github/workflows/integration.yml`, and locally on a real Docker) does the full
  loop against a throwaway `registry:2`: build → push → **digest resolution**
  (`docker buildx imagetools inspect`, incl. insecure-localhost) → pinned `compose up
  --wait` → `/health` → ledger digest assert → `compose down`. Green on real Docker
  Desktop 29.x as of 2026-06-13. Fixture: `test/integration/`.
- **Execution seam:** `deployPlan` / `runPipeline` / `runHooks` take an injectable
  `Executor` (default `defaultExecutor` = real execa). Tests inject a recording
  fake (`test/helpers/executor.ts`) to assert *which* commands run, *in what order*,
  *with which target context* — no daemon. Plus CLI `--dry-run` rendering + broken
  fixtures (cycle / missing dep / two-action step / missing secret) in `test/`.
- All pure logic: resolver/topo-sort, normalization, compose/swarm/k8s rendering,
  env/secret merging, image-ref rules, bundle tar pack/unpack, ledger round-trips,
  pipeline DAG ordering + cycle/validation, `parseDuration`, target/context logic.
- All `--dry-run` paths and `--output json` (verified clean, parseable stdout).
- Config loading for `.ts` / `.mjs` / `.js` / `.json` incl. `$secret` / `$catalog`
  JSON tags (verified via the `examples/` fixtures and ad-hoc temp repos).
- Catalog `file` source; HTTP/service sources via localhost stubs.

**Verified live:** `docker compose up --wait` / `compose down`, digest resolution +
pinning, ledger recording (compose backend) — see the integration script above.

**NOT verified yet (implemented, typechecks, but never run live):**
- `kaupang build` (compose `docker compose build`) — the integration builds the image
  directly with `docker build`; the CLI's own build command isn't exercised yet.
- `docker stack deploy` (swarm) and `kubectl apply` (kubernetes backend on a cluster).
- `oras push`/`pull` for the OCI catalog source and bundle-over-OCI.
- `kind`/real cluster for the Kubernetes backend (intentionally minimal: Namespace +
  Deployment + Service per service; no Ingress/PVC/ConfigMap/HPA/CRD).

**The compose path is proven; swarm / k8s / oras / `kaupang build` are the remaining
integration gaps** (the next jobs to add to `integration.yml`). Treat those live paths
as unproven until exercised on real infra.

---

## Repo layout & module responsibilities

```
src/
  cli.ts                 citty entry; subCommands: up, down, build, bundle, rollback, run
  index.ts               public API exports (define*, secret, use, all types)
  context.ts             makeContext(loaded, {pull?, targetEnv?}) → BackendContext

  config/
    types.ts             ALL types (KaupangConfig, ServiceSpec, EnvironmentDefinition,
                         CatalogConfig, SolutionRecipe, TargetConfig, Pipeline, WaitSpec, …)
    define.ts            identity helpers: defineConfig/Environment/Service/Solution/Pipeline,
                         secret(name)→{$secret}, use(name,overrides?)→{$catalog}
    loader.ts            findConfig (walks up for kaupang.config.{ts,mjs,js,json}),
                         loadConfig → LoadedConfig; uses jiti; JSON parsed directly.
                         cacheDir defaults to ".kaupang"
    normalize.ts         normalizeEnvironment, resolveImage (bare names get dockerRepository
                         prefix; anything with "/" or a catalog preset is left untouched), toArray

  graph/resolver.ts      topoSort (Kahn, cycle detection, returns order+waves),
                         resolvePlan (single root + deps), resolveMultiPlan (solutions)

  backends/
    types.ts             Backend{name,materialize}; MaterializedEnvironment{files,up,down,build,push?}
    compose-spec.ts      renderComposeFile (+ env merge, secrets → ${VAR})
    compose.ts           composeBackend + swarmBackend
    kubernetes.ts        kubernetesBackend (Namespace/Deployment/Service; secretKeyRef)
    index.ts             getBackend, backendNames

  image/resolve.ts       resolveDigest (via docker buildx imagetools inspect),
                         resolveEnvironmentImages (rewrites image→pinned digest), isPinned
  target/target.ts       resolveTarget (local implicit), applyTarget (prepends --context, injects env)
  ledger/ledger.ts       append-only history keyed "env@target"; DeploymentRecord; rollback helpers.
                         File: <cacheDir>/ledger.json
  solution/
    solution.ts          resolveSolution (inline config.solutions wins over catalog), applyPins
    bundle.ts            writeBundle/readBundle, tar pack/unpack, isOciRef, pushBundle/pullBundle (oras)
  catalog/source.ts      createCatalogResolver; file/http/service/oci sources (oci via oras)
  render/plan.ts         renderPlan (dry-run graph + commands)
  run/
    deploy.ts            deployPlan(loaded, plan, rt, opts) — SHARED deploy loop (binary check,
                         secret pre-flight, hooks, resolve→materialize→write→run→ledger).
                         Returns DeploymentRecord[]. Used by `up` AND pipeline up-steps.
    pipeline.ts          runPipeline — topo-sorts steps, runs run/up/down/build/wait
  commands/              up, down, build (--push), bundle (--push oci://), rollback, run
  util/                  exec (run, hasBinary, parseDuration, Executor/defaultExecutor),
                         env, hooks, names

examples/                runnable examples, one concept per folder; flagship is
                         examples/longhall/ (the Viking trading post — see below)
```

---

## Conventions & gotchas

- **ESM + TypeScript.** `tsconfig`: `module ESNext`, `moduleResolution Bundler`, `strict`,
  `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`. **`noUnusedLocals`
  is intentionally OFF** (tsup strips dead code; prune imports by hand when convenient).
- **The materialize seam is sacred.** `backend.materialize()` returns *data*
  (`files` + `BackendAction[]`), with **no side effects**. A separate layer executes
  the actions. This is what makes the tool testable — preserve it. To run commands
  against a target, actions go through `applyTarget(action, rt)` then `executor.run(...)`.
- **The execution seam: `Executor`.** `deployPlan` / `runPipeline` / `runHooks` run
  commands through an injected `Executor` (`util/exec.ts`; default `defaultExecutor`
  = real execa). Never import `run`/`runShell`/`hasBinary` directly into the deploy
  or pipeline layers — call them on the threaded `executor` so the recording fake can
  intercept. (The thin CLI command wrappers may still call `run` directly.)
- **One shared deploy path.** Both `up` and pipeline `up`-steps call `deployPlan`.
  Don't duplicate the deploy loop; extend `deployPlan`.
- **Image intent:** pinned ref (`@sha256`/`@1.4.2`) won't roll forward; floating
  (`latest`/channel) re-resolves each deploy. Always resolved→digest→pinned-in-artifact→ledger.
- **Secrets never hit disk.** `secret("VAR")` → compose/swarm emit `${VAR}` (with a
  fail-fast check that the var is present), k8s emit `secretKeyRef` into
  `<project>-secrets`. Never write the value to the artifact or ledger.
- **Compose relative paths.** The generated compose file lives under
  `<cacheDir>/<stack>/`, but `build:` contexts and bind mounts are authored relative
  to the **repo root**. The compose backend passes `--project-directory <rootDir>` so
  they resolve there — don't drop it. (Swarm `stack deploy` runs with `cwd=rootDir`,
  so its relative paths already resolve from the root.)
- **Run-to-completion jobs:** a service with `runOnce: true` (e.g. migrations) is
  forced to `restart: "no"`, and any dependent listing it in `dependsOn` renders the
  long-form `depends_on` with `condition: service_completed_successfully` — so
  `compose up --wait` waits for its clean exit instead of failing on it. Compose-only;
  swarm just won't restart it, and the minimal k8s backend ignores it.
- **Config formats:** `.ts`/`.mjs`/`.js`/`.json` all load. In `.json`, helpers are
  literal tags: `{"$secret":"X"}`, `{"$catalog":"name"}`. jiti only strips types from
  `.ts`, so `.js`/`.mjs` configs must be plain JS.
- **Renamed identifiers (post-rebrand from "devoply"):** cache dir `.kaupang`,
  env var `KAUPANG_TARGET`, public type `KaupangConfig`, OCI media type
  `application/vnd.kaupang.bundle.v1`. There should be **zero** "devoply" left.
- **CLI output is themed** (Viking terms + emoji on success/progress lines), but
  **error and warning *content* is kept plain and actionable** — keep it that way.
- **Command echo is off by default.** `run`/`runShell` only print the `$ <command>`
  line when `--verbose`/`-v` is passed (sets `setVerbose` in `util/exec.ts`) — or on a
  dry-run, which always echoes (that's the point of it). The deploy UI (`run/progress.ts`)
  carries the per-environment progress; docker/kubectl stream their own output beneath.
- **Env var precedence (low→high):** globalEnv < environment env < target env <
  (solution overlay) < service env.

---

## Build / dev / run

```bash
npm install
npm run build                 # tsup → dist/ (bin = kaupang → dist/cli.js)
npx tsc --noEmit              # typecheck
# run from source without building, via jiti:
npm run dev -- up market --dry-run --cwd examples/longhall
# run the built CLI against the fixture:
node dist/cli.js run voyage --dry-run --cwd examples/longhall
```

`package-lock.json` had its name field updated during the rename; if it ever looks
off, delete it and `npm install` once to regenerate cleanly.

---

## Examples (`examples/`)

A gallery of runnable examples, each folder named for the one concept it isolates
(`minimal`, `build-from-dockerfile`, `runonce-migrations`, `catalog-presets`,
`secrets`, `kubernetes`, `pipeline`, `json-config`). See `examples/README.md` for the
index. Run any with `--cwd examples/<folder>`. Each loads + `--dry-run`s clean offline.

The flagship is **`examples/longhall/`** — a Viking trading-post backend that exercises
everything together. Structure mirrors a real small app:
- `saga` env — the ledger store (catalog preset `saga-store` → postgres).
- `runes` env — the cache (`rune-cache` → redis).
- `market` env — depends on `saga` + `runes`; services `runecarver` (migrations,
  `runOnce`), `herald` (web/API), `huscarl` (worker). All three **build from a local
  context** (`examples/longhall/services/longhall-api/` — a tiny, dependency-free Node
  app + `Dockerfile`, one image, three roles via the `command`) sharing one image tag.
- targets: `local`, `vanaheim` (staging swarm), `asgard` (prod swarm).
- solution `longhall-full`; pipeline `voyage` (forge → landing → omen → feast).
- Secret: `LONGHALL_JARL_KEY` (must be set in the shell before a real `up market`).

It is a *reskin* of a generic shop/api app — the structure (deps, catalog, solution,
pipeline) is what's being exercised; the names are flavor. The longhall-api app has
no npm deps, so `docker build` works offline once `node:20-alpine` is pulled.

**Run it locally (real Docker):** `$env:LONGHALL_JARL_KEY="dev"` then
`node dist/cli.js build market --cwd examples/longhall` and
`node dist/cli.js up market --cwd examples/longhall`. `saga`/`runes` pull real
`postgres`/`redis`; `market` builds the local image.

---

## Roadmap / what's left

The core is complete: multi-backend deploys, targets, catalog (file/http/service/oci),
solutions, OCI bundles, pipelines, ledger + rollback, `--output json` digest handoff,
`build --push`, four config formats. Remaining ideas (none blocking):
- Parallel execution **within** a pipeline wave (independent steps run sequentially today).
- Surface the resolved public URL on a successful `up` for quick smoke-testing.
- Per-site rollback bounds in airgaps (constrain to versions a bundle carried in).
- Optionally theme `--dry-run` headers ("Voyage plan" vs "Deployment plan").

---

## Testing plan (steps 1–2 built; 3 pending)

Strategy exploits the materialize seam: test pure logic exhaustively offline; isolate
the execution boundary so it can be faked.

1. ✅ **Unit (runnable anywhere) — DONE.** Vitest suite in `test/` (`npm test`):
   resolver/topo-sort, normalize, compose+swarm+k8s renderers, env/secret utils,
   parseDuration, bundle pack/unpack + manifest round-trip, ledger, target/context,
   solution resolve + pins, names. All offline; no daemon. `npm run coverage` reports.
   Note: `tsconfig` `include` is `["src"]`, so `tsc --noEmit` does NOT typecheck
   `test/` — Vitest (esbuild) transpiles tests; type errors there surface only at
   `npm test`, not at `npm run typecheck`.
2. ✅ **Execution seam + CLI — DONE.** `deployPlan` / `runPipeline` / `runHooks` take
   an injectable `Executor` (default `defaultExecutor` = real execa, defined in
   `util/exec.ts`). `test/executor-seam.test.ts` injects a recording fake to assert
   which commands run, in what order, with which target context (compose/swarm/k8s),
   incl. dep-ordering, hook interleaving, fail→ledger-"failed", and the missing-secret
   pre-flight. `test/cli-dryrun.test.ts` loads JSON fixture repos under
   `test/fixtures/` (hermetic, no jiti/catalog/network) and checks `--dry-run`
   rendering + the broken cases (cycle / missing dep / two-action step). The backends
   needed no change — they were already the pure materialize seam; the `Executor`
   only wraps the layer that runs their emitted actions. (CLI command wrappers
   `up/down/build/rollback` still call the real `run` directly; their dry-run paths
   are covered, live execution is the integration job's job.)
3. 🟡 **Integration (real infra, separate CI job) — compose leg DONE; rest pending.**
   `scripts/integration-compose.sh` + `.github/workflows/integration.yml` stand up a
   local `registry:2`, build+push a tiny image, and run `up`/`down` against real Docker
   with digest resolution — **green locally on Docker Desktop 29.x**. Same script runs
   in CI (ubuntu, Docker preinstalled). Still to add as further jobs/scripts: `kaupang
   build`, `oras` catalog + bundle-over-OCI, swarm via `docker swarm init`, k8s via
   `kind`. Each new leg retires another slice of the verification gap.

CI: ✅ **fast job** — `.github/workflows/ci.yml` runs typecheck + `npm test` + build on
Node 20 & 22, then a `--dry-run` matrix over every `examples/` folder (guards against
example rot; hermetic, no daemon); `dist/` is passed from the test job to the examples
job as an artifact. ✅ **integration (compose leg)** — `.github/workflows/integration.yml`
runs `scripts/integration-compose.sh` on Docker (main + PRs). **Still pending:** swarm /
k8s (`kind`) / oras / `kaupang build` legs.

---

## Path to an OSS npm release (`kaupang` is free on npm)

In rough priority: (1) real integration testing per above; (2) the Vitest suite + CI;
(3) `LICENSE`, `CONTRIBUTING`, `CHANGELOG`, semver discipline, `package.json` publish
fields (`files`, `repository`, `prepublishOnly`); (4) sharpen or explicitly scope-down
the k8s backend so expectations are clear; (5) position vs Kamal/Compose/Helm — lead
with the differentiator: multi-backend + portable airgappable bundles + solutions.