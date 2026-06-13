import type {
  CatalogRef,
  KaupangConfig,
  EnvironmentDefinition,
  Pipeline,
  SecretRef,
  ServiceSpec,
  SolutionRecipe,
} from "./types.js";

/** Identity helper with full type-checking + autocomplete in kaupang.config.ts. */
export function defineConfig(config: KaupangConfig): KaupangConfig {
  return config;
}

/** Identity helper for environment files. */
export function defineEnvironment(
  env: EnvironmentDefinition,
): EnvironmentDefinition {
  return env;
}

/** Identity helper for a reusable service spec (e.g. shared in your repo). */
export function defineService(spec: ServiceSpec): ServiceSpec {
  return spec;
}

/**
 * Reference a service preset from the catalog, optionally overriding fields:
 *
 *   services: { db: use("postgres", { env: { POSTGRES_DB: "shop" } }) }
 */
export function use(name: string, overrides?: Partial<ServiceSpec>): CatalogRef {
  return overrides ? { $catalog: name, overrides } : { $catalog: name };
}

/**
 * Mark an env value as a secret. kaupang emits a `${NAME}` reference (resolved by
 * Docker at runtime from the process env) instead of writing the value into the
 * generated artifact or the ledger:
 *
 *   env: { DB_PASSWORD: secret("DB_PASSWORD") }       // same name
 *   env: { DB_PASSWORD: secret("PROD_DB_PASSWORD") }  // different source var
 */
export function secret(name: string): SecretRef {
  return { $secret: name };
}

/** Identity helper for a solution recipe (a named composition of environments). */
export function defineSolution(recipe: SolutionRecipe): SolutionRecipe {
  return recipe;
}

/** Identity helper for a pipeline (ordered run / up / down / build / wait steps). */
export function definePipeline(pipeline: Pipeline): Pipeline {
  return pipeline;
}
