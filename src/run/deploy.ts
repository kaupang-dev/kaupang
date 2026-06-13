import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { consola } from "consola";
import { getBackend } from "../backends/index.js";
import type { LoadedConfig } from "../config/loader.js";
import type { EnvMap, PullPolicy } from "../config/types.js";
import { makeContext } from "../context.js";
import type { DeploymentPlan } from "../graph/resolver.js";
import {
  appendDeployment,
  newDeploymentId,
  type DeploymentRecord,
} from "../ledger/ledger.js";
import { resolveEnvironmentImages, type ResolvedImage } from "../image/resolve.js";
import { applyTarget, type TargetRuntime } from "../target/target.js";
import { requiredSecretVars } from "../util/env.js";
import { defaultExecutor, type Executor } from "../util/exec.js";
import { runHooks } from "../util/hooks.js";
import {
  renderQueue,
  renderStepDone,
  renderStepFailed,
  renderStepStart,
  renderSummary,
} from "./progress.js";

export interface DeployOptions {
  targetName: string;
  targetEnv: EnvMap;
  pull?: PullPolicy;
  /** Resolve image references to pinned digests before deploying. */
  resolve: boolean;
}

/**
 * Bring up every environment in a plan: validate secrets, run hooks, resolve +
 * pin images, materialize, apply the target context, and record the ledger.
 * Shared by `kaupang up` and pipeline `up` steps so behavior is identical.
 */
export async function deployPlan(
  loaded: LoadedConfig,
  plan: DeploymentPlan,
  rt: TargetRuntime,
  opts: DeployOptions,
  executor: Executor = defaultExecutor,
): Promise<DeploymentRecord[]> {
  const backendName = plan.backend;
  const backend = getBackend(backendName);
  const ctx = makeContext(loaded, { pull: opts.pull, targetEnv: opts.targetEnv });
  const records: DeploymentRecord[] = [];

  const binary = backendName === "kubernetes" ? "kubectl" : "docker";
  if (!(await executor.hasBinary(binary))) {
    consola.warn(`"${binary}" was not found on PATH — commands will likely fail.`);
  }

  consola.log(renderQueue(plan, opts.targetName));

  // Fail fast on missing secrets (kubernetes reads them from an in-cluster Secret).
  if (backendName !== "kubernetes") {
    for (const env of plan.environments) {
      const serviceEnvs = Object.values(env.services).map((s) => s.env);
      const needed = requiredSecretVars(loaded.config.globalEnv, opts.targetEnv, env.env, ...serviceEnvs);
      const missing = needed.filter((v) => process.env[v] === undefined);
      if (missing.length) {
        throw new Error(
          `Missing secret env var(s) for "${env.name}": ${missing.join(", ")}. ` +
            `Set them in your shell or pipeline (Azure: map under the step's env:, e.g. ${missing[0]}: $(${missing[0]})).`,
        );
      }
    }
  }

  const total = plan.environments.length;
  const startedAll = Date.now();
  let step = 0;
  for (const env of plan.environments) {
    step++;
    consola.log(renderStepStart(step, total, env));
    const startedStep = Date.now();
    await runHooks(env.hooks?.beforeUp, { rootDir: ctx.rootDir, executor });

    let deployEnv = env;
    let images: ResolvedImage[] = [];
    if (opts.resolve) {
      const resolved = await resolveEnvironmentImages(env);
      deployEnv = resolved.env;
      images = resolved.images;
    }

    const m = backend.materialize(deployEnv, ctx);
    const record = (status: DeploymentRecord["status"]): DeploymentRecord => ({
      id: newDeploymentId(),
      environment: env.name,
      target: opts.targetName,
      backend: backendName,
      project: loaded.project,
      ranAt: new Date().toISOString(),
      status,
      images,
      files: m.files,
      up: m.up,
      down: m.down,
    });

    try {
      for (const f of m.files) {
        mkdirSync(dirname(f.path), { recursive: true });
        writeFileSync(f.path, f.content);
      }
      for (const action of m.up) {
        const a = applyTarget(action, rt);
        await executor.run(a.file, a.args, { cwd: ctx.rootDir, input: a.input, env: a.env });
      }
    } catch (err) {
      appendDeployment(loaded.cacheDir, record("failed"));
      consola.log(renderStepFailed(step, total, env));
      throw err;
    }

    await runHooks(env.hooks?.afterUp, { rootDir: ctx.rootDir, executor });
    const ok = record("succeeded");
    appendDeployment(loaded.cacheDir, ok);
    records.push(ok);
    consola.log(renderStepDone(step, total, env, Date.now() - startedStep));
  }

  consola.log(renderSummary(plan, opts.targetName, Date.now() - startedAll));
  return records;
}
