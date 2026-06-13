import type { CatalogResolver } from "../catalog/source.js";
import type { KaupangConfig, EnvMap, SolutionRecipe } from "../config/types.js";
import type { DeploymentPlan } from "../graph/resolver.js";

export interface ResolvedSolution {
  name: string;
  version?: string;
  /** Top-level environments to deploy (their dependencies are resolved later). */
  environments: string[];
  /** Per-service image overrides, keyed by "environment.service". */
  pins: Record<string, string>;
  /** Env overlay applied across the solution. */
  env: EnvMap;
  /** Default target, if the recipe declares one. */
  target?: string;
}

/**
 * Resolve a solution by name. Inline `config.solutions` wins over the catalog,
 * so a repo can override or define solutions locally; otherwise it falls back to
 * the hosted catalog (the `service` / `http` / `file` sources).
 */
export async function resolveSolution(
  config: KaupangConfig,
  catalog: CatalogResolver,
  name: string,
): Promise<ResolvedSolution> {
  const recipe: SolutionRecipe | undefined =
    config.solutions?.[name] ?? (await tryCatalog(catalog, name));

  if (!recipe) {
    const inline = Object.keys(config.solutions ?? {}).sort().join(", ") || "(none)";
    throw new Error(
      `Unknown solution "${name}". Inline solutions: ${inline}. ` +
        `(It may also live in the catalog — check your catalog sources.)`,
    );
  }

  if (!Array.isArray(recipe.environments) || recipe.environments.length === 0) {
    throw new Error(`Solution "${name}" must list at least one environment.`);
  }

  return {
    name,
    version: recipe.version,
    environments: recipe.environments,
    pins: recipe.pins ?? {},
    env: recipe.env ?? {},
    target: recipe.target,
  };
}

async function tryCatalog(
  catalog: CatalogResolver,
  name: string,
): Promise<SolutionRecipe | undefined> {
  try {
    return await catalog.resolveSolution(name);
  } catch {
    // No catalog configured or not found there — caller produces the final error.
    return undefined;
  }
}

/** Override service images from solution pins (keyed by "environment.service"). */
export function applyPins(plan: DeploymentPlan, pins: Record<string, string>): void {
  for (const [key, ref] of Object.entries(pins)) {
    const dot = key.indexOf(".");
    const envName = dot === -1 ? key : key.slice(0, dot);
    const service = dot === -1 ? "" : key.slice(dot + 1);
    const env = plan.environments.find((e) => e.name === envName);
    const svc = env && service ? env.services[service] : undefined;
    if (!svc) {
      throw new Error(`Solution pin "${key}" does not match any service (expected "env.service").`);
    }
    svc.image = ref;
  }
}
