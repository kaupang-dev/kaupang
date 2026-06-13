# kaupang examples

Each folder isolates one concept. Run any of them from the repo root with
`--cwd examples/<folder>` — e.g. `kaupang up web --cwd examples/minimal` (or, before a
global install, `node dist/cli.js up web --cwd examples/minimal`).

| Example | Shows |
| --- | --- |
| [minimal](minimal) | The smallest config — one public-image service on Compose. |
| [build-from-dockerfile](build-from-dockerfile) | A service built from a local `Dockerfile` (`build:` context). |
| [runonce-migrations](runonce-migrations) | A run-to-completion job (`runOnce`) that dependents wait on. |
| [catalog-presets](catalog-presets) | Reusable service presets via `use()` and a file catalog. |
| [secrets](secrets) | `secret("VAR")` → `${VAR}`, never written to disk. |
| [kubernetes](kubernetes) | The Kubernetes backend (Namespace / Deployment / Service). |
| [pipeline](pipeline) | A multi-step pipeline (run → up → wait → run). |
| [json-config](json-config) | The same idea authored in JSON instead of TypeScript. |
| [longhall](longhall) | The full showcase — build, `runOnce`, catalog, secrets, solution, pipeline, and multiple targets together. |

Most examples deploy to your local Docker via Compose; tear them down with
`kaupang down <env> --cwd examples/<folder>`. The Kubernetes example renders manifests
(use `--dry-run`, or apply them against a real cluster). Every example also supports
`--dry-run` to print the plan without touching anything.
