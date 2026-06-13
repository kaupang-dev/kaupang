# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). `@kaupang/core` and
`@kaupang/cli` are released together (lockstep).

## [Unreleased]

## [0.1.0] — Unreleased

Initial release.

### Added

- **Multi-backend deploys** from one config: Docker Compose, Docker Swarm, and a
  minimal Kubernetes backend (Namespace + Deployment + Service per service).
- **Config-authoring API** (`@kaupang/core`): `defineConfig`, `defineEnvironment`,
  `defineService`, `defineSolution`, `definePipeline`, `secret`, `use`, and all types.
- **`kaupang` CLI** (`@kaupang/cli`): `up`, `down`, `build` (`--push`), `bundle`
  (`--push oci://`), `rollback`, `run`; with `--dry-run`, `--target`, `--backend`,
  `--output json`, and `--verbose`.
- **Image resolution + digest pinning**, recorded in an append-only **ledger** keyed by
  `env@target`, with `rollback` to a known-good snapshot.
- **Catalog** presets via `use()` — `file` / `http` / `service` / `oci` sources.
- **Solutions** (named compositions of environments) and portable, pinned **OCI
  bundles** for airgapped delivery (push/pull via `oras`, with `--plain-http` for
  insecure/loopback registries).
- **Pipelines**: a DAG of run / up / down / build / wait steps.
- **Targets**: local and remote contexts with per-target backend, env, and
  docker/kube context.
- Run-to-completion jobs (`runOnce`) and lifecycle hooks.

### Verified

- Every deploy path exercised against real infrastructure — compose, swarm, Kubernetes
  (via kind), `build`/`--push`, digest resolution, and `oras` bundle + catalog — by
  `scripts/integration-*.sh` and the integration CI workflow.

[Unreleased]: https://github.com/kaupang-dev/kaupang/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kaupang-dev/kaupang/releases/tag/v0.1.0
