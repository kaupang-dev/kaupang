import { consola } from "consola";
import { getBackend } from "../backends/index.js";
import type { BackendContext } from "../backends/types.js";
import type { DeploymentPlan, EnvironmentPlan } from "../graph/resolver.js";
import { applyTarget, type TargetRuntime } from "../target/target.js";

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
};

/** Render the full plan for a dry-run: environment graph + service waves + commands. */
export function renderPlan(
  plan: DeploymentPlan,
  ctx: BackendContext,
  rt?: TargetRuntime,
): void {
  consola.log("");
  consola.log(
    `${c.bold("Deployment plan")} for ${c.cyan(plan.target)} ${c.dim(`(backend: ${plan.backend}${rt ? `, target: ${rt.name}` : ""})`)}`,
  );

  consola.log("");
  consola.log(c.bold("Environment start order:"));
  plan.environments.forEach((env, i) => {
    const deps = env.dependsOn.length
      ? c.dim(`  ← depends on ${env.dependsOn.join(", ")}`)
      : "";
    const marker = env.name === plan.target ? c.green("◆") : c.cyan("●");
    consola.log(`  ${i + 1}. ${marker} ${env.name}${deps}`);
  });

  consola.log("");
  consola.log(c.bold("Service graph (per environment):"));
  for (const env of plan.environments) {
    renderEnvironmentTree(env);
  }

  consola.log("");
  consola.log(c.bold("Commands that would run:"));
  const backend = getBackend(plan.backend);
  for (const env of plan.environments) {
    const m = backend.materialize(env, ctx);
    for (const file of m.files) {
      consola.log(`  ${c.dim("write")} ${file.path}`);
    }
    for (const action of m.up) {
      const a = rt ? applyTarget(action, rt) : action;
      consola.log(`  ${c.dim("$")} ${a.file} ${a.args.join(" ")}`);
    }
  }
  consola.log("");
}

function renderEnvironmentTree(env: EnvironmentPlan): void {
  consola.log("");
  consola.log(`  ${c.cyan(env.name)}`);
  if (env.order.length === 0) {
    consola.log(`  ${c.dim("└─ (no services)")}`);
    return;
  }
  env.waves.forEach((wave, i) => {
    const isLast = i === env.waves.length - 1;
    const branch = isLast ? "└─" : "├─";
    const label = wave.length > 1 ? `${c.dim("parallel")} ` : "";
    consola.log(`  ${branch} wave ${i + 1}: ${label}${wave.join(", ")}`);
    for (const svc of wave) {
      const deps = env.services[svc]?.dependsOn ?? [];
      if (deps.length) {
        const pad = isLast ? "   " : "│  ";
        consola.log(`  ${pad}${c.dim(`${svc} → ${deps.join(", ")}`)}`);
      }
    }
  });
}
