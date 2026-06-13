# kaupang

> **kaupang** *(KOW-pang)* — Old Norse for a Viking-age **trading hub**, from
> *kaup* "trade" + *vangr* "field, place." A kaupang was where goods from every
> craft were gathered, packed, and loaded onto ships bound for distant shores. This
> tool is that hub for your software: it gathers your services, pins them into a
> sealed, portable cargo, and dispatches them anywhere — your laptop, a CI agent, a
> remote swarm, or an airgapped site across the water. 🛶

**Spin up environments on Docker Compose, Docker Swarm, or Kubernetes from a
single TypeScript config — the same command on your laptop and in CI.**

kaupang is an imperative, push-based deploy tool — an *environment maker*, not a
reconciler. You run it, it makes a target match your config, it records exactly
what it did, and you can replay or roll back. No control loop, no cluster agent.

```bash
kaupang up api --target staging      # build the plan, resolve images, deploy
kaupang up api --dry-run             # show the dependency graph + commands, run nothing
kaupang rollback api --target prod   # re-apply the previous good deployment
kaupang down api                     # tear it back down
```

### Why a DevOps engineer might care

- **One tool, laptop to pipeline.** `kaupang up api --target staging` is byte-for-byte the same locally and on an agent. Only the *target* (context, env, backend) differs.
- **Config is code.** Environments are TypeScript, so image tags and env values can come straight from `process.env` / pipeline variables — no templating language.
- **Immutable, auditable deploys.** Every deploy resolves image tags to a digest, pins it, and records the whole artifact in a ledger. `rollback` replays a known-good snapshot.
- **Promotion is trivial.** Staging validates a digest; prod redeploys that exact digest. "What I tested is what I ship."
- **Multi-backend.** Swarm staging and Kubernetes prod from the same environment definition.

---

## Contents

- [Quick start](#quick-start)
- [Config](#config)
- [Environments & services](#environments--services)
- [Catalog (shared presets)](#catalog-shared-service-presets)
- [Targets (staging vs prod)](#targets-staging-vs-prod)
- [Solutions & bundles](#solutions--bundles)
- [Pipelines](#pipelines)
- [Single-service repo](#using-kaupang-in-a-single-service-repo-python-c-anything)
- [Versioning: resolve, pin, record, roll back](#versioning-resolve-pin-record-roll-back)
- [Secrets](#secrets)
- [Pull behavior](#pull-behavior)
- [Build & hooks](#build--hooks)
- [Dependency resolution](#dependency-resolution)
- [Backends](#backends)
- [Using kaupang in Azure DevOps](#using-kaupang-in-azure-devops)
- [Command reference](#command-reference)
- [Develop](#develop)
- [Roadmap](#roadmap)

---

## Quick start

```bash
npm install -g @kaupang/cli        # or use via npx in CI
```

Create a `kaupang.config.ts` at your repo root and an `environments/` folder:

```ts
// kaupang.config.ts
import { defineConfig } from "@kaupang/core";

export default defineConfig({
  environments: "./environments",
  project: "longhall",
  defaultBackend: "compose",
});
```

```ts
// environments/api.ts
import { defineEnvironment } from "@kaupang/core";

export default defineEnvironment({
  services: {
    web: { image: "ghcr.io/midgard/longhall-api:latest", ports: ["8080:3000"] },
  },
});
```

```bash
kaupang up api            # deploys locally with docker compose
kaupang up api --dry-run  # preview the plan first
```

---

## Config

```ts
import { defineConfig } from "@kaupang/core";

export default defineConfig({
  environments: "./environments",     // folder of environment files
  project: "longhall",                    // namespaces stacks / projects / namespaces
  defaultBackend: "compose",          // compose | swarm | kubernetes
  dockerRepository: "ghcr.io/midgard",   // prefix applied to bare image names
  defaultPull: "missing",             // always | missing | never
  cacheDir: ".kaupang",               // where generated files + the ledger live
  globalEnv: { TZ: "UTC" },           // injected into every service everywhere
  catalog: { sources: [{ type: "file", path: "./catalog.json" }] },
  targets: { /* see Targets */ },
});
```

Env var precedence (low → high): `globalEnv` < environment `env` < target `env` <
service `env`.

> **Not a TypeScript repo?** You don't need one. kaupang loads its config from
> `kaupang.config.ts`, `.mjs`, `.js`, **or `.json`** (and `environments/*` in any of
> those) — no `tsconfig`, no `typescript` dependency, no build step. Pick what fits:
>
> - **`.ts`** — full type-checking + autocomplete (the extension is transpiled at runtime).
> - **`.js` / `.mjs`** — plain JavaScript objects, with comments and the `secret()` /
>   `use()` helpers. Add `/** @type {import('kaupang').KaupangConfig} */` for checking.
> - **`.json`** — pure data, ideal for machine-generated configs. The helpers become
>   literal tags: `secret("X")` → `{ "$secret": "X" }`, `use("postgres")` →
>   `{ "$catalog": "postgres" }`. (No comments, and you write the tags by hand.)
>
> The `define*` helpers are identity functions, so a plain object — or a JSON file —
> is all they ever produce.

---

## Environments & services

An environment is a `docker-compose`-like definition, but in TypeScript. The
ergonomic surface is deliberately small:

```ts
import { defineEnvironment, use } from "@kaupang/core";

export default defineEnvironment({
  dependsOn: "postgres",                  // string or string[] — other environments
  services: {
    db: use("postgres"),                  // a whole service from the catalog
    web: "longhall-api:latest",               // string shorthand → { image: "longhall-api:latest" }
    worker: { image: "longhall-api", dependsOn: "web" },
  },
});
```

- A service can be a plain **string** (the image), a full **object**, or a
  catalog reference via **`use()`**.
- `dependsOn` accepts a string or an array, at both the environment and service
  level.
- With `dockerRepository` set, **bare** names (`longhall-api`) get prefixed
  (`ghcr.io/midgard/longhall-api`). Fully-qualified names (anything with a `/`) and
  catalog presets are left alone, so public images stay public.

Because the file is TypeScript, dynamic values just work:

```ts
web: { image: `longhall-api:${process.env.LONGHALL_API_TAG ?? "latest"}` }
```

That single line is what lets a pipeline pin a build by setting one env var.

---

## Catalog (shared service presets)

Reusable service definitions that live **outside** your repo and are pulled in at
load time — so a brand-new environment is a few `use()` calls plus your own
service. A catalog is a manifest of named presets:

```json
{
  "services": {
    "postgres": { "image": "postgres:16-alpine", "ports": ["5432:5432"],
                  "healthcheck": { "test": ["CMD-SHELL", "pg_isready"] } },
    "redis":    { "image": "redis:7-alpine", "ports": ["6379:6379"] }
  }
}
```

Reference presets with `use("name", overrides?)`. Sources are pluggable
(`src/catalog/source.ts` implements `CatalogSource`); earlier sources win:

| source     | status   | use it for                                             |
|------------|----------|--------------------------------------------------------|
| `file`     | shipped  | a manifest committed to a shared infra repo / vendored |
| `http`     | shipped  | a static manifest served by an internal endpoint       |
| `service`  | shipped  | a running internal catalog service kaupang queries     |
| `oci`      | shipped  | a versioned catalog published as an OCI artifact (ORAS)|

### Catalog service contract

The `service` source (a long-running internal catalog — e.g. a container your
platform team owns) just needs to answer a GET with JSON in this shape; both keys
are optional, so one service can serve presets and solutions together:

```jsonc
// GET https://catalog.internal/  →
{
  "services":  { "postgres": { "image": "postgres:16-alpine", "ports": ["5432:5432"] } },
  "solutions": { "hedeby": { "version": "2.3.1", "environments": ["api"],
                                 "pins": { "api.web": "longhall-api@sha256:…" } } }
}
```

```ts
catalog: { sources: [{ type: "service", url: "https://catalog.internal", headers: { Authorization: "Bearer …" } }] }
```

That single service is the "container that handles all things" — your shared
service presets *and* the solution recipes teams compose on the fly.

### OCI catalog (setup guide)

If you'd rather version the catalog as an immutable artifact in a registry you
already run (ACR, Harbor, ghcr, ECR …), publish it with [ORAS] and reference it
by `ref`. No new infrastructure — it reuses your image registry.

```bash
# 1. Author the manifest (services and/or solutions).
cat > catalog.json <<'JSON'
{ "services":  { "postgres": { "image": "postgres:16-alpine", "ports": ["5432:5432"] } },
  "solutions": { "hedeby": { "version": "2.3.1", "environments": ["api"] } } }
JSON

# 2. Authenticate to the registry (or `docker login` — oras reuses it).
oras login midgardregistry.azurecr.io -u <user> -p <token>

# 3. Push it as a versioned OCI artifact.
oras push midgardregistry.azurecr.io/kaupang-catalog:1 catalog.json
```

```ts
catalog: {
  sources: [{ type: "oci", ref: "midgardregistry.azurecr.io/kaupang-catalog:1" }],
}
```

kaupang pulls it with `oras pull` at load time, using your existing
`oras`/`docker login` credentials — the same auth story as image resolution, so
there's nothing extra to set up. By default it reads `catalog.json` from the
artifact; push a different filename and set it via the source's `path`. Pin a tag
(or a digest) for reproducibility, exactly like images.

---

## Targets (staging vs prod)

A **target** is where kaupang deploys: a remote cluster, a remote host, or your
machine. The *same* environment definition deploys to every target — only the
target's backend, env, and context differ. No duplicated environment files to
drift.

```ts
targets: {
  local: {},                                   // your default docker context
  staging: {
    backend: "swarm",
    dockerContext: "staging-swarm",            // → docker --context staging-swarm …
    pull: "always",                            // floating channel, roll forward
    env: { APP_ENV: "staging", PUBLIC_URL: "https://staging.longhall.example" },
  },
  prod: {
    backend: "kubernetes",
    kubeContext: "aks-prod",                   // → kubectl --context aks-prod …
    kubeconfig: "./kubeconfig-prod",           // sets KUBECONFIG for the run
    pull: "missing",                           // deploy the digest staging validated
    env: { APP_ENV: "production", PUBLIC_URL: "https://longhall.example" },
  },
},
```

```bash
kaupang up api --target staging   # docker --context staging-swarm stack deploy …
kaupang up api --target prod      # kubectl --context aks-prod apply …
```

Context selection rides on the tools' own mechanisms — `docker --context` /
`DOCKER_HOST` and `kubectl --context` / `KUBECONFIG`. Authenticate in your
pipeline as usual (`az acr login`, `az aks get-credentials`) and kaupang inherits
it. An unknown `--target` is a hard error that lists the configured ones. The
ledger is scoped per `environment@target`, so staging and prod keep separate
histories and roll back independently.

---

## Solutions & bundles

A **solution** is a named, versioned composition of environments — a whole
customized product for a customer or site. Recipes can live inline in config or,
more usefully, in the hosted catalog (so they're composed on the fly without a
repo):

```ts
solutions: {
  "hedeby": {
    version: "2.3.1",
    environments: ["birka", "ribe"], // dependencies pulled in automatically
    pins: { "birka.web": "longhall-api@sha256:…" }, // per-service version pins
    env: { JARL: "x" },
    target: "site-x",
  },
}
```

Deploy a solution directly (online — resolves images and deploys):

```bash
kaupang up --solution hedeby --target site-x
```

Or **bundle** it into a portable, fully-pinned artifact — the unit a pipeline
produces, and what crosses an air gap:

```bash
kaupang bundle hedeby --target site-x --with-images -o ./hedeby.bundle
```

A bundle is self-contained and relocatable: it holds the generated artifacts and
commands with bundle-relative paths, plus (with `--with-images`) `docker save`d
image tarballs. Deploy it with no source repo and no registry:

```bash
# inside an airgapped network, after extracting the 7z:
kaupang up --bundle ./hedeby.bundle --target site-x
```

Or distribute the bundle through a registry — the bridge between the online and
airgap flows. Push a materialized bundle as a single versioned OCI artifact, then
pull-and-deploy it anywhere by ref:

```bash
kaupang bundle hedeby --target site-x --push oci://midgardregistry.azurecr.io/bundles/hedeby:2.3.1
kaupang up --bundle oci://midgardregistry.azurecr.io/bundles/hedeby:2.3.1 --target site-x
```

Push/pull use `oras` (same auth as the OCI catalog source), so a solution becomes
a versioned, pullable thing in the registry you already run. `up --bundle` accepts
either a local directory or an `oci://` ref.

`up --bundle` loads any included images and replays the pinned artifacts through
the target's context — the same deploy path as everything else, just offline. It
records to the ledger like any deploy, so rollback works inside the gap too
(bounded by which versions were carried in).

The chain: service presets → solution recipe (catalog) → bundle (pipeline, pinned
+ images) → target → live URL. Online and airgapped use the *same* bundle artifact;
only the transport differs.

---

## Pipelines

A pipeline is an ordered set of steps — shell commands, deploys, builds, and waits
— wired together as a DAG. It's the *recipe* part of CI: the portable sequence of
kaupang actions that runs byte-for-byte the same on your laptop and on an agent.
The CI system still owns triggers, approvals, and secrets; the pipeline owns what
actually happens.

```ts
import { defineConfig, definePipeline } from "@kaupang/core";

export default defineConfig({
  // …environments, targets…
  pipelines: {
    release: definePipeline({
      steps: {
        build:  { run: "npm run build" },
        deploy: { up: "api", needs: "build" },
        smoke:  { wait: { http: "http://localhost:8080/health", timeout: "30s" }, needs: "deploy" },
        done:   { run: "echo released", needs: "smoke" },
      },
    }),
  },
});
```

```bash
kaupang run release --target staging
kaupang run release --dry-run     # print the step DAG, run nothing
```

Each step declares exactly one action and optional `needs`:

| action            | does                                                            |
|-------------------|-----------------------------------------------------------------|
| `run: "<cmd>"`    | runs a shell command from the config root                       |
| `up: "<env>"`     | deploys an environment — same path as `kaupang up <env>`        |
| `down: "<env>"`   | tears an environment down                                       |
| `build: "<env>"`  | builds the environment's images                                 |
| `wait: { … }`     | gates on `http` (poll a URL for a status) or `seconds` (sleep)  |

Steps are topologically sorted from `needs`; cycles are rejected up front, and the
dry-run shows which steps fall in the same wave (independent, so safe to parallelize
later). `up` / `down` / `build` steps honor `--target` (or a per-step `target` /
`backend` override) and go through the identical resolve → pin → materialize →
ledger path as the top-level commands — a pipeline `up` is a real, recorded deploy,
not a second code path. `wait` example:

```ts
smoke: { wait: { http: "https://api.longhall.example/health", status: 200, interval: "2s", timeout: "2m" }, needs: "deploy" }
```

In Azure DevOps this is one step inside a stage — `npx @kaupang/cli run release --target
staging` — so approvals/gates stay in the YAML while the deploy recipe stays in
kaupang and stays runnable locally.

---

## Versioning: resolve, pin, record, roll back

Every `up` resolves each service's image reference to an immutable **digest** at
deploy time, pins that digest into the generated artifact, and records the whole
deployment in a ledger (`.kaupang/ledger.json`). One mechanism supports both
intents — you choose by what you write:

- **Pinned** — `image: "longhall-api@sha256:…"` or `use("longhall-api@1.4.2")`. A named
  version; re-running `up` won't roll forward unless you edit the file.
- **Floating** — `image: "longhall-api:latest"`, a channel like `@stable`, or
  `use("longhall-api")`. May point somewhere new each deploy, so `up` resolves and
  records each time and can roll the environment forward.

Either way, the thing that lands on the target is a digest, so a persistent
remote deploy never silently drifts when someone re-pushes a tag. Resolution uses
`docker buildx imagetools inspect` with the agent's existing login. Two escape
hatches: a floating ref that resolves to nothing is a hard error (never deploy
stale), and `--no-resolve` deploys references as-is — needed in the local loop
where you `kaupang build` an image that was never pushed.

The ledger stores the exact artifact and commands that were applied, so rollback
is just "replay a known-good snapshot":

```bash
kaupang rollback api --list                       # show history with digests
kaupang rollback api                              # re-apply the previous good deploy
kaupang rollback api --to 20260611T140000Z-bbbb   # roll to a specific deployment
kaupang rollback api --dry-run                    # print the replay, run nothing
```

Because the target is declarative, rollback runs the same path as `up` — no
reconciler, no diffing. Each rollback is itself recorded, so you can roll back a
rollback.

### Handing resolved digests to a later stage

`up --output json` prints what was actually deployed — including the digest each
floating ref resolved to — as clean JSON on stdout (progress logs are suppressed).
That's the explicit "resolve once in staging, promote the *same* digest to prod"
handoff:

```bash
# staging stage: deploy and capture exactly what landed
kaupang up api --target staging --output json > resolved.json
```

```json
{
  "project": "longhall",
  "target": "staging",
  "backend": "swarm",
  "deployments": [
    { "environment": "api", "deploymentId": "20260612T…-ab12", "ranAt": "…",
      "images": [ { "service": "web", "ref": "ghcr.io/midgard/longhall-api:latest",
                    "digest": "sha256:9f86d0…", "pinned": true } ] }
  ]
}
```

A later prod stage reads `resolved.json` and deploys those digests, with no second
resolution and no chance of a tag moving underneath you. `--dry-run --output json`
emits the planned graph (no digests) for inspection or gating instead.

---

## Secrets

Wrap any env value in `secret("VAR")` and kaupang emits a **reference** instead of
the value — so secrets never land in the generated artifact or the ledger:

```ts
import { defineEnvironment, secret } from "@kaupang/core";

export default defineEnvironment({
  services: {
    web: {
      image: "longhall-api",
      env: {
        LOG_LEVEL: "info",                  // literal — persisted (fine, aids rollback)
        API_KEY: secret("LONGHALL_JARL_KEY"),    // → resolved at runtime, never written
        DB_PASS: secret("PROD_DB_PASSWORD"),// container var DB_PASS ← host PROD_DB_PASSWORD
      },
    },
  },
});
```

- **Compose / Swarm:** emitted as `${LONGHALL_JARL_KEY}` and interpolated by Docker at
  runtime from the process env. kaupang **validates up front** that every
  referenced var is present and fails fast with a clear message if not — so you
  never deploy with a silently-empty secret.
- **Kubernetes:** emitted as a `secretKeyRef` into a `Secret` named
  `<project>-secrets` (key = the source var), which you manage in the cluster
  (e.g. `kubectl create secret`, External Secrets, or a CSI driver). The value
  never enters the manifest.

Non-secret config (a literal string) is still persisted in the artifact and
ledger on purpose — that's what makes rollback hermetic. Only marked values are
held out.

---

## Pull behavior

- Per service: `pull: "always" | "missing" | "never"` → Compose `pull_policy`.
- Whole run: `--pull always` → Compose `up --pull always`; Swarm
  `stack deploy --resolve-image=always` (re-resolves tags to the newest digest).
- Honest caveat: there is no portable "pull latest only if it exists" — `docker
  pull` errors on a missing tag. `--pull missing` is the safe default; registries
  without a `latest` tag are fine as long as you pin tags.

---

## Build & hooks

```ts
defineEnvironment({
  hooks: {
    beforeUp: ["npm run build"],            // shell string, or { run, cwd, env }
    afterUp: [{ run: "./smoke-test.sh", cwd: "./scripts" }],
  },
  services: { web: { build: "./web" } },    // docker compose build picks this up
});
```

`kaupang build <env>` runs `docker compose build` for services that declare a
`build` context, tagging each as its (repository-prefixed) `image`. Add `--push`
to `docker compose push` them to the registry in the same step. Hooks run around
`up`/`down` (`beforeUp` / `afterUp` / `beforeDown` / `afterDown`).

---

## Using kaupang in a single-service repo (Python, C++, anything)

kaupang operates on your **image**, not your source — so the service's language is
irrelevant. Whatever turns your code into a container image (a `Dockerfile`,
buildpacks, `ko`, …) is yours to keep; kaupang builds/pushes/deploys the result.
A Python or C++ repo needs three small things: the `Dockerfile` you'd have anyway,
plus two plain-JS files (no TypeScript).

```
my-service/
├─ Dockerfile               # your build — Python, C++, Go, whatever
├─ kaupang.config.mjs
└─ environments/
   └─ app.mjs
```

```js
// kaupang.config.mjs
export default {
  environments: "./environments",
  project: "my-service",
  dockerRepository: "ghcr.io/me",   // bare image names get this prefix
  targets: {
    local: {},                                              // your machine
    prod: { backend: "swarm", dockerContext: "prod-swarm", pull: "missing" },
  },
};
```

```js
// environments/app.mjs
export default {
  services: {
    app: {
      image: "my-service",          // publish/deploy target → ghcr.io/me/my-service
      build: { context: "." },      // build from ./Dockerfile
      ports: ["8000:8000"],
    },
  },
};
```

A Python `Dockerfile` is just the usual `FROM python:3.12-slim` → `pip install` →
`CMD ["uvicorn", "main:app", …]`; a C++ one is a multi-stage compile (`FROM gcc` →
build → copy the binary into a slim runtime). kaupang doesn't care which — it only
needs the resulting image tag. Then:

```bash
kaupang build app                 # docker compose build  → tags ghcr.io/me/my-service
kaupang build app --push          # build, then push it to the registry
kaupang up app                    # run it locally via compose
kaupang up app --target prod      # resolve the pushed image to a digest, deploy to swarm
```

That's the whole loop in one repo: build, publish, deploy — same commands locally
and in CI. The catalog/solutions/bundle machinery is there when you grow into
multiple services or sites, but a single service uses none of it.

---

## Dependency resolution

Two levels, both topologically sorted with cycle detection: between environments
(`dependsOn`, resolved recursively) and between services within an environment.
`--dry-run` renders both, grouping services into parallelizable waves:

```
Environment start order:
  1. ● postgres
  2. ● redis
  3. ◆ api  ← depends on postgres, redis

  api
  ├─ wave 1: migrate
  └─ wave 2: parallel web, worker
```

---

## Backends

| Backend      | `up`                              | `build`                | Notes |
|--------------|-----------------------------------|------------------------|-------|
| `compose`    | `docker compose up -d --wait`     | `docker compose build` | Full support. |
| `swarm`      | `docker stack deploy`             | — (build + push in CI) | Uses the `deploy` key; cross-environment ordering handled by kaupang. |
| `kubernetes` | `kubectl apply`                   | — (build + push in CI) | Namespace + Deployment (+ Service) per service. Needs prebuilt images. |

---

## Using kaupang in Azure DevOps

kaupang runs as an ordinary step on a Microsoft-hosted or self-hosted agent. The
pattern that gets the most value out of it:

1. **Build & push** the application image (immutable, build-id–tagged).
2. **Deploy to staging** with kaupang — it resolves the tag to a digest, pins it,
   smoke-tests, and records the deployment.
3. **Promote to prod** behind an approval — deploy the *same* tag, which resolves
   to the *same* digest staging validated.

> **Azure variables gotcha:** non-secret pipeline / variable-group values are
> auto-exposed as environment variables, but **secret** variables are not — you
> must map them explicitly in the step's `env:` block (`FOO: $(foo)`). kaupang (a
> Node process) and the `docker`/`kubectl` it spawns read from that environment.

### 1. Multi-stage build → staging → prod (the main pattern)

```yaml
# azure-pipelines.yml
trigger:
  branches: { include: [ main ] }

variables:
  imageTag: $(Build.BuildId)          # immutable tag — the key to safe promotion
  registry: midgardregistry.azurecr.io

pool:
  vmImage: ubuntu-latest

stages:
  - stage: Build
    jobs:
      - job: build
        steps:
          - checkout: self
          - script: az acr login --name midgardregistry
            displayName: Registry login
          - script: |
              docker build -t $(registry)/longhall-api:$(imageTag) .
              docker push $(registry)/longhall-api:$(imageTag)
            displayName: Build & push image

  - stage: Staging
    dependsOn: Build
    jobs:
      - deployment: deployStaging
        environment: staging          # auto-deploys (no approval attached)
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: NodeTool@0
                  inputs: { versionSpec: "20.x" }
                # Resolves longhall-api:$(imageTag) → a digest, pins it, records it.
                - script: npx @kaupang/cli up api --target staging
                  displayName: Deploy to staging
                  env:
                    LONGHALL_API_TAG: $(imageTag)
                    DOCKER_HOST: $(STAGING_DOCKER_HOST)   # secret → mapped here
                    LONGHALL_JARL_KEY: $(jarlKey)           # secret() ref → mapped here
                - script: ./scripts/smoke-test.sh https://staging.longhall.example
                  displayName: Smoke test

  - stage: Production
    dependsOn: Staging
    jobs:
      - deployment: deployProd
        environment: production       # attach a manual-approval check in the UI
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: NodeTool@0
                  inputs: { versionSpec: "20.x" }
                # Same immutable tag ⇒ same digest staging validated.
                - script: npx @kaupang/cli up api --target prod
                  displayName: Promote to production
                  env:
                    LONGHALL_API_TAG: $(imageTag)
                    KUBECONFIG: $(PROD_KUBECONFIG)        # secret file path
                    # API_KEY comes from the in-cluster <project>-secrets Secret on k8s
```

The matching environment file reads the tag from the pipeline:

```ts
// environments/api.ts
export default defineEnvironment({
  services: {
    web: { image: `longhall-api:${process.env.LONGHALL_API_TAG ?? "latest"}`, ports: ["8080:3000"] },
  },
});
```

The `production` Azure DevOps Environment is where you attach the approval/check,
so the promote stage waits for a human before `kaupang up api --target prod` runs.

### 2. Validate config on every PR (cheap gate, no deploy)

```yaml
# azure-pipelines-pr.yml
pr:
  branches: { include: [ main ] }

pool: { vmImage: ubuntu-latest }

steps:
  - checkout: self
  - task: NodeTool@0
    inputs: { versionSpec: "20.x" }
  # Fails the PR if the config doesn't resolve; prints the dependency graph.
  - script: npx @kaupang/cli up api --target staging --dry-run
    displayName: Validate deploy plan
```

`--dry-run` is hermetic (no registry calls, no deploy), so it's a fast,
safe pre-merge check that the graph resolves and the commands look right.

### 3. One-click rollback pipeline

```yaml
# azure-pipelines-rollback.yml  (manual trigger)
trigger: none

parameters:
  - name: target
    type: string
    default: prod
  - name: to
    type: string
    default: ""          # empty = previous good deployment

pool: { vmImage: ubuntu-latest }

steps:
  - checkout: self
  - task: NodeTool@0
    inputs: { versionSpec: "20.x" }
  - script: az aks get-credentials --name midgard-${{ parameters.target }} --resource-group midgard
    displayName: Cluster login
  - script: |
      if [ -n "${{ parameters.to }}" ]; then
        npx @kaupang/cli rollback api --target ${{ parameters.target }} --to ${{ parameters.to }}
      else
        npx @kaupang/cli rollback api --target ${{ parameters.target }}
      fi
    displayName: Roll back api
```

> For rollback to find history, the ledger must persist between runs (an agent
> workspace is ephemeral). Commit it to a deploy repo, publish it as a pipeline
> artifact, or — recommended — point `cacheDir` at a mounted volume on a
> self-hosted agent so the ledger survives.

### Separating the app and deploy repos

If kaupang config lives in a dedicated deploy repo, check both out:

```yaml
resources:
  repositories:
    - repository: deploy
      type: git
      name: midgard/deploy

steps:
  - checkout: self        # the application repo
  - checkout: deploy      # the kaupang config + environments
  - script: npx @kaupang/cli up api --target staging --cwd $(Build.SourcesDirectory)/deploy
    env: { LONGHALL_API_TAG: $(imageTag) }
```

The app repo publishes immutable images; the deploy repo declares and rolls them
out. kaupang's catalog is the natural seam between them: the app's publish
pipeline registers `longhall-api → …@digest`, and the deploy repo's `use("longhall-api")`
picks it up.

---

## Command reference

```
kaupang up <env>          [-b ...] [--target <t>] [--pull ...] [--no-resolve] [--dry-run] [--output json] [--cwd <dir>]
kaupang up --solution <s> [--target <t>] [--pull ...] [--no-resolve] [--dry-run] [--output json] [--cwd <dir>]
kaupang up --bundle <dir|oci://ref> [--target <t>] [--dry-run] [--cwd <dir>]   # offline / airgap
kaupang down <env>        [-b ...] [--target <t>] [--with-deps] [--dry-run] [--cwd <dir>]
kaupang build <env>       [-b ...] [--push] [--dry-run] [--cwd <dir>]
kaupang bundle <solution> [--target <t>] [--with-images] [--push oci://ref] [-o <dir>] [--no-resolve] [--cwd <dir>]
kaupang rollback <env>    [--to <id>] [--target <t>] [--list] [--dry-run] [--cwd <dir>]
kaupang run <pipeline>    [--target <t>] [--dry-run] [--cwd <dir>]
```

`--target` defaults to `local` (or `$KAUPANG_TARGET`). `--cwd` resolves the config
from a directory other than the current one.

---

## Develop

```bash
npm install
npm run dev -- up web --dry-run --cwd examples/minimal   # run from source via jiti
npm run build                                            # bundle to dist/ with tsup
npm run typecheck
npm test                                                 # vitest suite (offline)
```

The [`examples/`](examples/) folder is a gallery of runnable samples, each named for
the one concept it isolates — `minimal`, `build-from-dockerfile`, `runonce-migrations`,
`catalog-presets`, `secrets`, `kubernetes`, `pipeline`, and `json-config`. Run any with
`--cwd examples/<folder>`.

The flagship is [`examples/longhall/`](examples/longhall/) — a tiny Viking trading-post
backend that exercises everything together: a `saga` store and a `runes` cache (both
from a file catalog) plus a `market` that builds its image from a local `Dockerfile`
and depends on them, deployable to the `local`, `vanaheim`, and `asgard` realms
(targets). It also defines a `longhall-full` solution and a `voyage` pipeline.

---

## Roadmap

The core is in place: multi-backend deploys, targets, the catalog (file/http/service/oci),
solutions, OCI bundles, pipelines, the ledger + rollback, and `--output json` digest
handoff. Ideas under consideration next:

- **Parallel execution within a pipeline wave** — independent steps in the same
  wave currently run sequentially; they could run concurrently.
- **Surface the resolved public URL** on a successful `up` for quick smoke-testing.
- **Per-site rollback bounds in airgaps** — constrain rollback to the versions a
  bundle actually carried in.

[ORAS]: https://oras.land

---

kaupang stays an imperative push tool: it makes a target match your config,
records what it did, and replays on request. It is deliberately *not* a
continuous reconciler — if you need git-driven self-healing, reach for Argo CD or
Flux. The niche here is great ergonomics and local/CI parity for teams that want
to *run a deploy*, not operate a control plane.
