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
 * Prefix a bare image name with the docker repository.
 * Fully-qualified names (anything containing "/") are left untouched, so
 * public/official images should be written in full or pulled from the catalog.
 */
export function resolveImage(image: string | undefined, repo?: string): string | undefined {
  if (!image || !repo) return image;
  if (image.includes("/")) return image;
  return `${repo.replace(/\/+$/, "")}/${image}`;
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
