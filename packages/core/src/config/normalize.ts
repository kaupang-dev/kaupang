import type { CatalogResolver } from "../catalog/source.js";
import type {
  CatalogRef,
  Dependable,
  EnvMap,
  EnvironmentDefinition,
  Hooks,
  PullPolicy,
  ServiceDefinition,
  ServiceInput,
  ServiceSpec,
} from "./types.js";

/** The normalized environment shape consumed by the resolver + backends. */
export interface NormalizedEnvironment {
  name: string;
  file: string;
  services: Record<string, ServiceDefinition>;
  dependsOn: string[];
  env: EnvMap;
  hooks?: Hooks;
  networks?: string[];
  volumes?: string[];
}

interface NormalizeContext {
  dockerRepository?: string;
  defaultPull?: PullPolicy;
  catalog: CatalogResolver;
}

export function toArray(value?: Dependable): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Prefix an image name with the docker repository unless it is already fully
 * qualified. "Fully qualified" means the first path segment looks like a registry
 * host — it contains a "." or ":", or is "localhost". So a namespaced name like
 * `team/api` still gets the prefix (`<repo>/team/api`), while `ghcr.io/team/api`
 * or `localhost:5000/api` are left untouched. Bare public images (`redis`) get
 * prefixed too — write them in full or pull them from the catalog to avoid that.
 */
export function resolveImage(image: string | undefined, repo?: string): string | undefined {
  if (!image || !repo) return image;
  if (isFullyQualified(image)) return image;
  return `${repo.replace(/\/+$/, "")}/${image}`;
}

function isFullyQualified(image: string): boolean {
  const slash = image.indexOf("/");
  if (slash === -1) return false;
  const host = image.slice(0, slash);
  return host.includes(".") || host.includes(":") || host === "localhost";
}

function isCatalogRef(input: ServiceInput): input is CatalogRef {
  return typeof input === "object" && input !== null && "$catalog" in input;
}

function mergeSpec(base: ServiceSpec, overrides?: Partial<ServiceSpec>): ServiceSpec {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    env: { ...base.env, ...overrides.env },
    labels: { ...base.labels, ...overrides.labels },
  };
}

function finalize(
  spec: ServiceSpec,
  ctx: NormalizeContext,
  fromCatalog: boolean,
): ServiceDefinition {
  const { dependsOn, image, pull, ...rest } = spec;
  return {
    ...rest,
    // Catalog presets carry their own (public) images — don't re-prefix them.
    image: fromCatalog ? image : resolveImage(image, ctx.dockerRepository),
    dependsOn: toArray(dependsOn),
    pull: pull ?? ctx.defaultPull,
  };
}

async function normalizeService(
  input: ServiceInput,
  ctx: NormalizeContext,
): Promise<ServiceDefinition> {
  if (typeof input === "string") {
    return finalize({ image: input }, ctx, false);
  }
  if (isCatalogRef(input)) {
    const base = await ctx.catalog.resolve(input.$catalog);
    return finalize(mergeSpec(base, input.overrides), ctx, true);
  }
  return finalize(input, ctx, false);
}

export async function normalizeEnvironment(
  def: EnvironmentDefinition,
  name: string,
  file: string,
  ctx: NormalizeContext,
): Promise<NormalizedEnvironment> {
  const localCtx: NormalizeContext = {
    catalog: ctx.catalog,
    dockerRepository: def.dockerRepository ?? ctx.dockerRepository,
    defaultPull: def.pull ?? ctx.defaultPull,
  };

  const services: Record<string, ServiceDefinition> = {};
  for (const [key, input] of Object.entries(def.services)) {
    services[key] = await normalizeService(input, localCtx);
  }

  return {
    name,
    file,
    services,
    dependsOn: toArray(def.dependsOn),
    env: def.env ?? {},
    hooks: def.hooks,
    networks: def.networks,
    volumes: def.volumes,
  };
}
