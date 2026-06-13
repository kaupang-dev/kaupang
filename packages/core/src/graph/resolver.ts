import type { ResolvedEnvironment } from "../config/loader.js";
import type { BackendName, EnvMap, Hooks, ServiceDefinition } from "../config/types.js";

export interface EnvironmentPlan {
  name: string;
  file: string;
  /** Environment-scoped env vars (merged over globalEnv, under service env). */
  env: EnvMap;
  /** Environments this one directly depends on. */
  dependsOn: string[];
  /** Services in a valid start order. */
  order: string[];
  /** Services grouped into waves that can be started in parallel. */
  waves: string[][];
  services: Record<string, ServiceDefinition>;
  /** Lifecycle hooks for this environment. */
  hooks?: Hooks;
}

export interface DeploymentPlan {
  /** The environment the user asked for. */
  target: string;
  backend: BackendName;
  /** Environments in start order: dependencies first, target last. */
  environments: EnvironmentPlan[];
}

interface TopoResult {
  order: string[];
  waves: string[][];
}

/**
 * Kahn's algorithm. `deps.get(n)` is the set of nodes that must come BEFORE n.
 * Returns a flat order plus waves (each wave can be started concurrently).
 * Throws on cycles or references to unknown nodes.
 */
export function topoSort(
  nodes: string[],
  deps: Map<string, string[]>,
  label: string,
): TopoResult {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n, 0);
    dependents.set(n, []);
  }

  for (const n of nodes) {
    for (const d of deps.get(n) ?? []) {
      if (!indegree.has(d)) {
        throw new Error(`${label} "${n}" depends on unknown "${d}".`);
      }
      indegree.set(n, indegree.get(n)! + 1);
      dependents.get(d)!.push(n);
    }
  }

  const order: string[] = [];
  const waves: string[][] = [];
  let frontier = nodes.filter((n) => indegree.get(n) === 0).sort();

  while (frontier.length > 0) {
    waves.push([...frontier]);
    const next: string[] = [];
    for (const n of frontier) {
      order.push(n);
      for (const dep of dependents.get(n)!) {
        indegree.set(dep, indegree.get(dep)! - 1);
        if (indegree.get(dep) === 0) next.push(dep);
      }
    }
    frontier = next.sort();
  }

  if (order.length !== nodes.length) {
    const cyclic = nodes.filter((n) => !order.includes(n));
    throw new Error(
      `Dependency cycle detected among ${label}s: ${cyclic.join(", ")}.`,
    );
  }

  return { order, waves };
}

/** Build a full deployment plan for `target` (including its transitive deps). */
export function resolvePlan(
  target: string,
  environments: Map<string, ResolvedEnvironment>,
  backend: BackendName,
): DeploymentPlan {
  if (!environments.has(target)) {
    const available = [...environments.keys()].sort().join(", ") || "(none)";
    throw new Error(`Unknown environment "${target}". Available: ${available}.`);
  }
  return buildPlan([target], target, environments, backend);
}

/** Like resolvePlan but for several root environments (used by solutions). */
export function resolveMultiPlan(
  roots: string[],
  label: string,
  environments: Map<string, ResolvedEnvironment>,
  backend: BackendName,
): DeploymentPlan {
  return buildPlan(roots, label, environments, backend);
}

function buildPlan(
  roots: string[],
  label: string,
  environments: Map<string, ResolvedEnvironment>,
  backend: BackendName,
): DeploymentPlan {
  // Collect all transitive environment dependencies (with cycle detection).
  const involved = new Set<string>();
  const visit = (name: string, stack: string[]): void => {
    if (stack.includes(name)) {
      throw new Error(
        `Environment dependency cycle: ${[...stack, name].join(" -> ")}.`,
      );
    }
    if (involved.has(name)) return;
    const env = environments.get(name);
    if (!env) {
      const from = stack.at(-1) ?? "(root)";
      throw new Error(
        `Environment "${name}" (required by "${from}") was not found.`,
      );
    }
    involved.add(name);
    for (const dep of env.dependsOn ?? []) visit(dep, [...stack, name]);
  };
  for (const root of roots) visit(root, []);

  // Order the environments themselves.
  const envDeps = new Map<string, string[]>();
  for (const name of involved) {
    const env = environments.get(name)!;
    envDeps.set(name, (env.dependsOn ?? []).filter((d) => involved.has(d)));
  }
  const { order: envOrder } = topoSort([...involved], envDeps, "environment");

  // Order services within each environment.
  const plans: EnvironmentPlan[] = envOrder.map((name) => {
    const env = environments.get(name)!;
    const serviceNames = Object.keys(env.services);
    const svcDeps = new Map<string, string[]>();
    for (const svc of serviceNames) {
      const declared = env.services[svc]!.dependsOn ?? [];
      for (const d of declared) {
        if (!env.services[d]) {
          throw new Error(
            `Service "${svc}" in environment "${name}" depends on unknown service "${d}".`,
          );
        }
      }
      svcDeps.set(svc, declared);
    }
    const { order, waves } = topoSort(serviceNames, svcDeps, "service");
    return {
      name,
      file: env.file,
      env: env.env ?? {},
      dependsOn: env.dependsOn ?? [],
      order,
      waves,
      services: env.services,
      hooks: env.hooks,
    };
  });

  return { target: label, backend, environments: plans };
}
