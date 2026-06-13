import { defineConfig } from "@kaupang/core";

// A tiny Viking trading-post backend, "longhall", shown deploying to three realms.
export default defineConfig({
  environments: "./environments",
  defaultBackend: "compose",
  project: "longhall",
  // Bare image names (e.g. "longhall-api") get prefixed with this.
  dockerRepository: "ghcr.io/midgard",
  defaultPull: "missing",
  globalEnv: { TZ: "UTC", LOG_LEVEL: "info" },
  // Reusable service presets resolved from a shared catalog (not in this repo).
  catalog: {
    sources: [
      { type: "file", path: "./catalog.json" },
      // Or from a shared HTTP endpoint, a live catalog service, or an OCI artifact:
      // { type: "http", url: "https://infra.midgard.dev/catalog.json" },
      // { type: "service", url: "https://catalog.internal" },
      // { type: "oci", ref: "midgardregistry.azurecr.io/kaupang-catalog:1" },
    ],
  },
  // The same definitions, dispatched to different realms (targets).
  targets: {
    local: {}, // your own hearth — the local docker context
    vanaheim: {
      // staging realm
      backend: "swarm",
      dockerContext: "vanaheim-swarm", // docker --context vanaheim-swarm …
      pull: "always", // floating channel, roll forward on each deploy
      env: { REALM: "vanaheim", PUBLIC_URL: "https://staging.longhall.example" },
    },
    asgard: {
      // production realm
      backend: "swarm",
      dockerContext: "asgard-swarm",
      pull: "missing", // deploy the digest vanaheim validated
      env: { REALM: "asgard", PUBLIC_URL: "https://longhall.example" },
    },
  },
  // Named compositions. Each is a site/customer "solution" you can bundle + deploy.
  solutions: {
    "longhall-full": {
      version: "1.0.0",
      environments: ["market"], // saga + runes come in as dependencies
      env: { JARL: "ragnar" },
    },
  },
  // Ordered, DAG-based recipes — a release "voyage", runnable locally and in CI.
  pipelines: {
    voyage: {
      steps: {
        forge: { run: "echo 'forging the cargo…'" },
        landing: { up: "market", needs: "forge" },
        omen: { wait: { http: "http://localhost:8080/health", timeout: "30s" }, needs: "landing" },
        feast: { run: "echo 'the feast begins 🍺'", needs: "omen" },
      },
    },
  },
});
