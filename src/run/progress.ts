import type { DeploymentPlan, EnvironmentPlan } from "../graph/resolver.js";

// Live deploy UI. Pure string builders (no I/O) so they're unit-testable; the
// deploy loop prints them with consola.log. We deliberately DON'T redraw in
// place — `docker compose` streams its own progress block via inherited stdio,
// and fighting it would garble the terminal. Instead: show the queue up front,
// then a start/done line around each environment as it runs.

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;

/** One-line summary of an environment's service waves: "migrate → web, worker". */
function servicesLabel(env: EnvironmentPlan): string {
  if (env.order.length === 0) return "(no services)";
  return env.waves.map((wave) => wave.join(", ")).join(" → ");
}

/** The up-front deploy queue: every environment in start order, marked pending. */
export function renderQueue(plan: DeploymentPlan, target: string): string {
  const n = plan.environments.length;
  const width = Math.max(...plan.environments.map((e) => e.name.length));
  const lines = [
    "",
    `${bold("⛵ Voyage")} to ${cyan(plan.target)} ${dim(`· ${plan.backend} → ${target}`)}`,
    dim(`   queue · ${n} environment${n === 1 ? "" : "s"}`),
  ];
  plan.environments.forEach((env, i) => {
    const dep = env.dependsOn.length ? dim(`  ← ${env.dependsOn.join(", ")}`) : "";
    lines.push(
      `     ${dim("○")} ${dim(`${i + 1}/${n}`)}  ${cyan(env.name.padEnd(width))}  ${dim(servicesLabel(env))}${dep}`,
    );
  });
  lines.push("");
  return lines.join("\n");
}

/** Printed just before an environment starts deploying. */
export function renderStepStart(i: number, total: number, env: EnvironmentPlan): string {
  return `${cyan("▶")} ${dim(`[${i}/${total}]`)} ${bold(env.name)} ${dim("…")}`;
}

/** Printed after an environment is up. */
export function renderStepDone(
  i: number,
  total: number,
  env: EnvironmentPlan,
  ms: number,
): string {
  return `${green("✔")} ${dim(`[${i}/${total}]`)} ${env.name} ${dim(`(${fmtMs(ms)})`)}`;
}

/** Printed when an environment fails to come up. */
export function renderStepFailed(i: number, total: number, env: EnvironmentPlan): string {
  return `${red("✖")} ${dim(`[${i}/${total}]`)} ${env.name} ${red("failed")}`;
}

/** Closing summary after every environment is up. */
export function renderSummary(plan: DeploymentPlan, target: string, ms: number): string {
  const n = plan.environments.length;
  const names = plan.environments.map((e) => e.name).join(", ");
  return (
    // Two spaces: the 🛖 emoji is rendered double-width and swallows a single
    // trailing space in many terminals, gluing it to the name.
    `${green("🛖")}  ${bold(plan.target)} ${dim("stands on")} ${cyan(target)} ` +
    `${dim(`· ${n}/${n} up (${fmtMs(ms)})`)}\n     ${dim(names)}`
  );
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
