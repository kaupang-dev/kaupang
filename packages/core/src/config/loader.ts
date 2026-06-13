import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createJiti } from "jiti";
import { createCatalogResolver, type CatalogResolver } from "../catalog/source.js";
import { normalizeEnvironment, type NormalizedEnvironment } from "./normalize.js";
import type { KaupangConfig, EnvironmentDefinition } from "./types.js";

const CONFIG_NAMES = [
  "kaupang.config.ts",
  "kaupang.config.mjs",
  "kaupang.config.js",
  "kaupang.config.json",
];
const ENV_INDEX_NAMES = ["index.ts", "index.mjs", "index.js", "index.json"];
const ENV_FILE_RE = /\.(ts|mts|mjs|js|json)$/;

/** Normalized environment, ready for the resolver. */
export type ResolvedEnvironment = NormalizedEnvironment;

export interface LoadedConfig {
  config: KaupangConfig;
  configPath: string;
  rootDir: string;
  cacheDir: string;
  project: string;
  catalog: CatalogResolver;
  environments: Map<string, ResolvedEnvironment>;
}

export function findConfig(cwd = process.cwd()): string | null {
  let dir = resolve(cwd);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function sanitizeProject(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^[_-]+|[_-]+$/g, "") || "kaupang"
  );
}

export async function loadConfig(cwd = process.cwd()): Promise<LoadedConfig> {
  const configPath = findConfig(cwd);
  if (!configPath) {
    throw new Error(
      `No kaupang config found. Create a "kaupang.config.ts" (or .mjs / .js / .json) in ${resolve(cwd)} or a parent directory.`,
    );
  }

  const rootDir = dirname(configPath);
  const jiti = createJiti(rootDir, { moduleCache: false });

  const config = await importDefault<KaupangConfig>(jiti, configPath);
  if (!config || typeof config.environments !== "string") {
    throw new Error(
      `${configPath} must \`export default defineConfig({ environments: "<folder>" })\`.`,
    );
  }

  const envDir = resolve(rootDir, config.environments);
  if (!existsSync(envDir)) {
    throw new Error(
      `Environments folder not found: ${envDir} (config.environments = "${config.environments}").`,
    );
  }

  const cacheDir = resolve(rootDir, config.cacheDir ?? ".kaupang");
  const project = sanitizeProject(config.project ?? basename(rootDir));
  const catalog = createCatalogResolver(config.catalog, rootDir);
  const environments = await loadEnvironments(jiti, envDir, config, catalog);

  return { config, configPath, rootDir, cacheDir, project, catalog, environments };
}

async function loadEnvironments(
  jiti: ReturnType<typeof createJiti>,
  envDir: string,
  config: KaupangConfig,
  catalog: CatalogResolver,
): Promise<Map<string, ResolvedEnvironment>> {
  const map = new Map<string, ResolvedEnvironment>();

  for (const entry of readdirSync(envDir, { withFileTypes: true })) {
    let file: string | null = null;
    let fallbackName = entry.name;

    if (
      entry.isFile() &&
      ENV_FILE_RE.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      file = join(envDir, entry.name);
      fallbackName = basename(entry.name, extname(entry.name));
    } else if (entry.isDirectory()) {
      for (const idx of ENV_INDEX_NAMES) {
        const candidate = join(envDir, entry.name, idx);
        if (existsSync(candidate)) {
          file = candidate;
          break;
        }
      }
    }

    if (!file) continue;

    const def = await importDefault<EnvironmentDefinition>(jiti, file);
    if (!def || typeof def.services !== "object") {
      throw new Error(
        `${file} must \`export default defineEnvironment({ services: { ... } })\`.`,
      );
    }

    const name = def.name ?? fallbackName;
    if (map.has(name)) {
      throw new Error(
        `Duplicate environment name "${name}" (in ${file} and ${map.get(name)!.file}).`,
      );
    }

    const normalized = await normalizeEnvironment(def, name, file, {
      dockerRepository: config.dockerRepository,
      defaultPull: config.defaultPull,
      catalog,
    });
    map.set(name, normalized);
  }

  return map;
}

async function importDefault<T>(
  jiti: ReturnType<typeof createJiti>,
  path: string,
): Promise<T> {
  // JSON is plain data — parse it directly (no default-export wrapper).
  if (path.endsWith(".json")) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch (err) {
      throw new Error(`Failed to parse ${path}: ${(err as Error).message}`);
    }
  }
  const mod = (await jiti.import(path)) as { default?: T } & T;
  return (mod.default ?? mod) as T;
}
