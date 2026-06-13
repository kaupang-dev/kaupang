import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KaupangConfig } from "../src/config/types.js";
import { history } from "../src/ledger/ledger.js";
import { deployPlan } from "../src/run/deploy.js";
import { runPipeline } from "../src/run/pipeline.js";
import { resolveTarget } from "../src/target/target.js";
import {
  deploymentPlan,
  envPlan,
  makeLoaded,
  normEnv,
  recordingExecutor,
} from "./helpers/executor.js";

// A pinned digest short-circuits image resolution (no real `docker` call), so
// pipeline up-steps (which always resolve) stay fully offline.
const PINNED = `nginx@sha256:${"a".repeat(64)}`;

let dir: string;
let cacheDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kaupang-seam-"));
  cacheDir = join(dir, ".kaupang");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("deployPlan execution seam", () => {
  it("emits a compose up command through the executor with the target context", async () => {
    const rec = recordingExecutor();
    const loaded = makeLoaded({ rootDir: dir, cacheDir });
    const config: KaupangConfig = { environments: "e", targets: { asgard: { dockerContext: "prod-ctx" } } };
    const rt = resolveTarget(config, "asgard", dir);

    const records = await deployPlan(
      loaded,
      deploymentPlan([envPlan("market", { web: { image: "nginx" } })], { backend: "compose" }),
      rt,
      { targetName: "asgard", targetEnv: rt.env, resolve: false },
      rec.executor,
    );

    const runs = rec.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.file).toBe("docker");
    expect(runs[0]!.args.slice(0, 2)).toEqual(["--context", "prod-ctx"]);
    expect(runs[0]!.args).toContain("longhall_market");
    expect(runs[0]!.args.slice(-3)).toEqual(["up", "-d", "--wait"]);
    expect(runs[0]!.cwd).toBe(dir);
    // relative build contexts / binds resolve from the repo root, not the cache dir
    expect(runs[0]!.args[runs[0]!.args.indexOf("--project-directory") + 1]).toBe(dir);

    // The materialized compose file is written, and a success record is appended.
    expect(existsSync(join(cacheDir, "longhall_market", "docker-compose.yml"))).toBe(true);
    expect(records).toHaveLength(1);
    expect(history(cacheDir, "market", "asgard").at(-1)!.status).toBe("succeeded");
  });

  it("deploys dependencies first and interleaves hooks in order", async () => {
    const rec = recordingExecutor();
    const loaded = makeLoaded({ rootDir: dir, cacheDir });
    const rt = resolveTarget({ environments: "e" }, "local", dir);

    const saga = envPlan(
      "saga",
      { store: { image: "postgres" } },
      { hooks: { beforeUp: ["echo before"], afterUp: ["echo after"] } },
    );
    const market = envPlan("market", { web: { image: "nginx" } }, { dependsOn: ["saga"] });

    await deployPlan(
      loaded,
      deploymentPlan([saga, market]),
      rt,
      { targetName: "local", targetEnv: {}, resolve: false },
      rec.executor,
    );

    expect(rec.calls.map((c) => `${c.kind}:${c.file}`)).toEqual([
      "shell:echo before",
      "run:docker",
      "shell:echo after",
      "run:docker",
    ]);
    expect(rec.runs()[0]!.args).toContain("longhall_saga");
    expect(rec.runs()[1]!.args).toContain("longhall_market");
  });

  it("fails fast on a missing secret without running any command", async () => {
    const rec = recordingExecutor();
    const loaded = makeLoaded({ rootDir: dir, cacheDir });
    const rt = resolveTarget({ environments: "e" }, "local", dir);
    const plan = deploymentPlan([
      envPlan("market", { web: { image: "nginx", env: { KEY: { $secret: "KAUPANG_UNSET_SECRET" } } } }),
    ]);

    await expect(
      deployPlan(loaded, plan, rt, { targetName: "local", targetEnv: {}, resolve: false }, rec.executor),
    ).rejects.toThrow(/Missing secret/);
    expect(rec.runs()).toHaveLength(0);
  });

  it("records a failed deployment when a command throws, then rethrows", async () => {
    const rec = recordingExecutor({ failOn: (c) => c.file === "docker" });
    const loaded = makeLoaded({ rootDir: dir, cacheDir });
    const rt = resolveTarget({ environments: "e" }, "local", dir);

    await expect(
      deployPlan(
        loaded,
        deploymentPlan([envPlan("market", { web: { image: "nginx" } })]),
        rt,
        { targetName: "local", targetEnv: {}, resolve: false },
        rec.executor,
      ),
    ).rejects.toThrow(/forced failure/);
    expect(history(cacheDir, "market", "local").at(-1)!.status).toBe("failed");
  });

  it("uses kubectl + kube context and skips the secret pre-flight for kubernetes", async () => {
    const rec = recordingExecutor();
    const loaded = makeLoaded({ rootDir: dir, cacheDir });
    const config: KaupangConfig = {
      environments: "e",
      targets: { prod: { backend: "kubernetes", kubeContext: "kube-prod" } },
    };
    const rt = resolveTarget(config, "prod", dir);
    // The unset secret would throw on compose, but k8s reads it from an in-cluster Secret.
    const plan = deploymentPlan(
      [envPlan("market", { web: { image: "nginx", ports: ["80"], env: { KEY: { $secret: "UNSET" } } } })],
      { backend: "kubernetes" },
    );

    await deployPlan(
      loaded,
      plan,
      rt,
      { targetName: "prod", targetEnv: {}, resolve: false },
      rec.executor,
    );

    const runs = rec.runs();
    expect(runs[0]!.file).toBe("kubectl");
    expect(runs[0]!.args.slice(0, 2)).toEqual(["--context", "kube-prod"]);
    expect(runs[0]!.args).toContain("apply");
  });
});

describe("runPipeline execution seam", () => {
  function pipelineLoaded(config: KaupangConfig) {
    return makeLoaded({
      rootDir: dir,
      cacheDir,
      config,
      environments: new Map([
        ["market", normEnv("market", { web: { image: PINNED } })],
      ]),
    });
  }

  it("runs steps in dependency order, dispatching run + up through the executor", async () => {
    const rec = recordingExecutor();
    const loaded = pipelineLoaded({
      environments: "e",
      defaultBackend: "compose",
      pipelines: {
        voyage: {
          steps: {
            forge: { run: "echo forging" },
            landing: { up: "market", needs: "forge" },
          },
        },
      },
    });

    await runPipeline(loaded, "voyage", { target: "local", dryRun: false }, rec.executor);

    expect(rec.calls.map((c) => `${c.kind}:${c.file}`)).toEqual(["shell:echo forging", "run:docker"]);
    expect(rec.runs()[0]!.args.slice(-3)).toEqual(["up", "-d", "--wait"]);
    expect(history(cacheDir, "market", "local").at(-1)!.status).toBe("succeeded");
  });

  it("dispatches a build step through the executor", async () => {
    const rec = recordingExecutor();
    const loaded = pipelineLoaded({
      environments: "e",
      defaultBackend: "compose",
      pipelines: { p: { steps: { forge: { build: "market" } } } },
    });

    await runPipeline(loaded, "p", { target: "local", dryRun: false }, rec.executor);

    const runs = rec.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.args.slice(-1)).toEqual(["build"]);
  });

  it("runs nothing through the executor on a dry-run", async () => {
    const rec = recordingExecutor();
    const loaded = pipelineLoaded({
      environments: "e",
      defaultBackend: "compose",
      pipelines: { voyage: { steps: { landing: { up: "market" } } } },
    });

    await runPipeline(loaded, "voyage", { target: "local", dryRun: true }, rec.executor);
    expect(rec.calls).toHaveLength(0);
  });
});
