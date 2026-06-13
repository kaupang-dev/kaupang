import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { consola } from "consola";
import { backendNames, getBackend } from "../backends/index.js";
import type { LoadedConfig } from "../config/loader.js";
import type { BackendName, Pipeline, PipelineStep } from "../config/types.js";
import { makeContext } from "../context.js";
import { resolvePlan, topoSort } from "../graph/resolver.js";
import { applyTarget, resolveTarget, type TargetRuntime } from "../target/target.js";
import { toArray } from "../config/normalize.js";
import { defaultExecutor, parseDuration, type Executor } from "../util/exec.js";
import { runHooks } from "../util/hooks.js";
import { deployPlan } from "./deploy.js";

const ACTION_KEYS = ["run", "up", "down", "build", "wait"] as const;

interface RunPipelineOptions {
  target?: string;
  dryRun: boolean;
}

export async function runPipeline(
  loaded: LoadedConfig,
  name: string,
  opts: RunPipelineOptions,
  executor: Executor = defaultExecutor,
): Promise<void> {
  const pipeline = loaded.config.pipelines?.[name];
  if (!pipeline) {
    const available = Object.keys(loaded.config.pipelines ?? {}).sort().join(", ") || "(none)";
    throw new Error(`Unknown pipeline "${name}". Available: ${available}.`);
  }

  const stepNames = Object.keys(pipeline.steps);
  if (stepNames.length === 0) throw new Error(`Pipeline "${name}" has no steps.`);

  // Validate each step declares exactly one action.
  for (const s of stepNames) validateStep(s, pipeline.steps[s]!);

  // Order the steps (cycle detection + waves) with the existing DAG engine.
  const deps = new Map(stepNames.map((s) => [s, toArray(pipeline.steps[s]!.needs)]));
  const { order, waves } = topoSort(stepNames, deps, "step");

  if (opts.dryRun) {
    renderPipeline(name, pipeline, waves, opts.target);
    return;
  }

  consola.info(`🛶 Setting out on voyage "${name}" (${order.join(" → ")})`);
  for (const step of order) {
    consola.start(`⚓ leg: ${step}`);
    await runStep(loaded, pipeline.steps[step]!, opts.target, executor);
    consola.success(step);
  }
  consola.success(`🍺 Voyage "${name}" complete — to the feast!`);
}

function validateStep(name: string, step: PipelineStep): void {
  const present = ACTION_KEYS.filter((k) => step[k] !== undefined);
  if (present.length !== 1) {
    throw new Error(
      `Pipeline step "${name}" must have exactly one of ${ACTION_KEYS.join(" / ")} (got ${present.length}).`,
    );
  }
}

async function runStep(
  loaded: LoadedConfig,
  step: PipelineStep,
  defaultTarget: string | undefined,
  executor: Executor,
): Promise<void> {
  if (step.run !== undefined) {
    await runHooks([step.run], { rootDir: loaded.rootDir, executor });
    return;
  }
  if (step.wait !== undefined) {
    await runWait(step.wait);
    return;
  }

  // up / down / build all act on an environment against a target.
  const targetName = step.target ?? defaultTarget ?? process.env.KAUPANG_TARGET ?? "local";
  const rt = resolveTarget(loaded.config, targetName, loaded.rootDir);
  const backendName = pickBackend(step.backend, rt.backend, loaded.config.defaultBackend);

  if (step.up !== undefined) {
    const plan = resolvePlan(step.up, loaded.environments, backendName);
    await deployPlan(
      loaded,
      plan,
      rt,
      {
        targetName,
        targetEnv: rt.env,
        pull: rt.pull ?? loaded.config.defaultPull,
        resolve: true,
      },
      executor,
    );
    return;
  }

  if (step.build !== undefined) {
    await runEnvActions(loaded, step.build, backendName, rt, "build", executor);
    return;
  }
  if (step.down !== undefined) {
    await runEnvActions(loaded, step.down, backendName, rt, "down", executor);
    return;
  }
}

/** Materialize the target environment and run its build/down actions through the target. */
async function runEnvActions(
  loaded: LoadedConfig,
  envName: string,
  backendName: BackendName,
  rt: TargetRuntime,
  kind: "build" | "down",
  executor: Executor,
): Promise<void> {
  const plan = resolvePlan(envName, loaded.environments, backendName);
  const env = plan.environments.find((e) => e.name === plan.target)!;
  const ctx = makeContext(loaded, { targetEnv: rt.env });
  const m = getBackend(backendName).materialize(env, ctx);
  const actions = kind === "build" ? m.build : m.down;
  if (kind === "build" && actions.length === 0) {
    consola.info(`  (no build context in "${envName}" — nothing to build)`);
    return;
  }
  if (kind === "down" && !env) return;
  if (kind === "build") {
    for (const f of m.files) {
      mkdirSync(dirname(f.path), { recursive: true });
      writeFileSync(f.path, f.content);
    }
  }
  for (const action of actions) {
    const a = applyTarget(action, rt);
    await executor.run(a.file, a.args, { cwd: ctx.rootDir, input: a.input, env: a.env });
  }
}

async function runWait(spec: { http?: string; status?: number; interval?: string; timeout?: string; seconds?: number }): Promise<void> {
  if (spec.seconds !== undefined) {
    consola.log(`  ⏳ waiting ${spec.seconds}s`);
    await sleep(spec.seconds * 1000);
    return;
  }
  if (!spec.http) throw new Error('A `wait` step needs either `http` or `seconds`.');

  const want = spec.status ?? 200;
  const interval = parseDuration(spec.interval ?? "2s");
  const deadline = Date.now() + parseDuration(spec.timeout ?? "60s");
  consola.log(`  🔮 reading the omens at ${spec.http} → ${want}`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(spec.http);
      if (res.status === want) return;
    } catch {
      // not up yet
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${spec.http} to return ${want}.`);
}

function pickBackend(
  step: BackendName | undefined,
  fromTarget: BackendName | undefined,
  fallback: BackendName | undefined,
): BackendName {
  const name = (step ?? fromTarget ?? fallback ?? "compose") as BackendName;
  if (!backendNames.includes(name)) {
    throw new Error(`Unknown backend "${name}" in pipeline step.`);
  }
  return name;
}

function renderPipeline(
  name: string,
  pipeline: Pipeline,
  waves: string[][],
  target: string | undefined,
): void {
  consola.log(`\nPipeline "${name}"${target ? ` → ${target}` : ""}\n`);
  waves.forEach((wave, i) => {
    consola.log(`  wave ${i + 1}${wave.length > 1 ? " (parallelizable)" : ""}:`);
    for (const step of wave) {
      consola.log(`    - ${step}: ${describe(pipeline.steps[step]!)}`);
    }
  });
  consola.log("");
}

function describe(step: PipelineStep): string {
  if (step.run !== undefined) {
    return `run ${typeof step.run === "string" ? step.run : step.run.run}`;
  }
  if (step.up !== undefined) return `up ${step.up}${step.target ? ` → ${step.target}` : ""}`;
  if (step.down !== undefined) return `down ${step.down}`;
  if (step.build !== undefined) return `build ${step.build}`;
  if (step.wait?.http) return `wait for ${step.wait.http}`;
  if (step.wait?.seconds !== undefined) return `wait ${step.wait.seconds}s`;
  return "(empty)";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
