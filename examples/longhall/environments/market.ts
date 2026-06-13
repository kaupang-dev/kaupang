import { defineEnvironment, secret } from "@kaupang/core";

// The longhall itself: where trade happens. Depends on the saga store and rune cache.
export default defineEnvironment({
  name: "market",
  dependsOn: ["saga", "runes"], // string or array both work
  env: {
    DATABASE_URL: "postgres://skald:skald@longhall_saga-store:5432/saga",
    REDIS_URL: "redis://longhall_runes-cache:6379",
    REALM: "midgard", // overridden by the vanaheim/asgard targets
    PUBLIC_URL: "http://localhost:8080",
    // Emitted as ${LONGHALL_JARL_KEY}; never written to the artifact or ledger.
    JARL_KEY: secret("LONGHALL_JARL_KEY"),
  },
  hooks: {
    beforeUp: ["echo 'forging the longhall…'"],
    afterUp: ["echo 'the longhall stands ✅'"],
  },
  services: {
    // All three roles are the SAME image (built from ./services/longhall-api),
    // run with different commands — the classic web / migrate / worker split.
    // `build` is a context relative to the repo root; `image` is the tag it
    // produces (bare name -> ghcr.io/midgard/longhall-api). `kaupang build market`
    // builds it; `kaupang up market` builds-if-needed, then runs.

    // runecarver carves the schema into the saga store (migrations) and exits.
    // `runOnce` = a run-to-completion job: herald/huscarl wait for it to finish
    // successfully before starting, and `up --wait` won't flag its exit as a failure.
    runecarver: {
      build: "./services/longhall-api",
      image: "longhall-api",
      command: ["npm", "run", "migrate"],
      runOnce: true,
    },
    // herald announces the longhall to the world (the web/API server).
    herald: {
      build: "./services/longhall-api",
      image: "longhall-api",
      ports: ["8080:3000"],
      dependsOn: "runecarver", // single string is fine
      healthcheck: {
        test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"],
        interval: "5s",
        timeout: "3s",
        retries: 5,
      },
    },
    // huscarl does the background work — a loyal retainer of the hall.
    huscarl: {
      build: "./services/longhall-api",
      image: "longhall-api",
      command: ["npm", "run", "worker"],
      dependsOn: "runecarver",
    },
  },
});
