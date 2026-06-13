import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { orasRegistryArgs } from "../util/registry.js";
import type {
  CatalogConfig,
  CatalogSourceConfig,
  ServiceSpec,
  SolutionRecipe,
} from "../config/types.js";

/** A catalog manifest: reusable service presets and/or solution recipes. */
export interface CatalogManifest {
  services?: Record<string, ServiceSpec>;
  solutions?: Record<string, SolutionRecipe>;
}

export interface CatalogSource {
  readonly describe: string;
  load(): Promise<CatalogManifest>;
}

/** Resolves presets and solutions against one or more sources (earlier sources win). */
export interface CatalogResolver {
  resolve(name: string): Promise<ServiceSpec>;
  list(): Promise<string[]>;
  resolveSolution(name: string): Promise<SolutionRecipe>;
  listSolutions(): Promise<string[]>;
}

class FileCatalogSource implements CatalogSource {
  readonly describe: string;
  constructor(private path: string) {
    this.describe = `file:${path}`;
  }
  async load(): Promise<CatalogManifest> {
    if (!existsSync(this.path)) {
      throw new Error(`Catalog file not found: ${this.path}`);
    }
    return JSON.parse(readFileSync(this.path, "utf8")) as CatalogManifest;
  }
}

class HttpCatalogSource implements CatalogSource {
  readonly describe: string;
  constructor(
    private url: string,
    private headers?: Record<string, string>,
    kind = "http",
  ) {
    this.describe = `${kind}:${url}`;
  }
  async load(): Promise<CatalogManifest> {
    const res = await fetch(this.url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Catalog ${res.status} from ${this.url}`);
    }
    return (await res.json()) as CatalogManifest;
  }
}

/**
 * Pull a catalog manifest published as an OCI artifact, via the `oras` CLI:
 *   oras push <ref> catalog.json
 * Auth comes from your existing `oras login` / `docker login`, exactly like image
 * resolution — we never hand-roll a registry client.
 */
class OciCatalogSource implements CatalogSource {
  readonly describe: string;
  constructor(
    private ref: string,
    private file = "catalog.json",
  ) {
    this.describe = `oci:${ref}`;
  }
  async load(): Promise<CatalogManifest> {
    const dir = mkdtempSync(join(tmpdir(), "kaupang-oci-"));
    try {
      await execa("oras", ["pull", ...orasRegistryArgs(this.ref), this.ref, "-o", dir]);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === "ENOENT") {
        throw new Error(
          `Catalog "oci" source needs the \`oras\` CLI on PATH (https://oras.land). ` +
            `Install it, or use a file / http / service source instead.`,
        );
      }
      throw new Error(`oras pull ${this.ref} failed: ${e.message ?? String(err)}`);
    }
    const file = join(dir, this.file);
    try {
      if (!existsSync(file)) {
        throw new Error(
          `Pulled ${this.ref} but it has no "${this.file}". ` +
            `Push it as that filename: oras push ${this.ref} ${this.file}`,
        );
      }
      return JSON.parse(readFileSync(file, "utf8")) as CatalogManifest;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function createSource(cfg: CatalogSourceConfig, rootDir: string): CatalogSource {
  switch (cfg.type) {
    case "file":
      if (!cfg.path) throw new Error('Catalog "file" source needs a `path`.');
      return new FileCatalogSource(resolve(rootDir, cfg.path));
    case "http":
      if (!cfg.url) throw new Error('Catalog "http" source needs a `url`.');
      return new HttpCatalogSource(cfg.url, cfg.headers, "http");
    case "service":
      // A running catalog service: same JSON contract as http, served live.
      if (!cfg.url) throw new Error('Catalog "service" source needs a `url`.');
      return new HttpCatalogSource(cfg.url, cfg.headers, "service");
    case "oci":
      if (!cfg.ref) throw new Error('Catalog "oci" source needs a `ref`.');
      return new OciCatalogSource(cfg.ref, cfg.path);
    default:
      throw new Error(`Unknown catalog source type "${(cfg as { type: string }).type}".`);
  }
}

interface MergedCatalog {
  services: Record<string, ServiceSpec>;
  solutions: Record<string, SolutionRecipe>;
}

/** Build a resolver from config; lazily loads + caches each source's manifest. */
export function createCatalogResolver(
  config: CatalogConfig | undefined,
  rootDir: string,
): CatalogResolver {
  const sources = (config?.sources ?? []).map((c) => createSource(c, rootDir));
  let merged: Promise<MergedCatalog> | null = null;

  const loadAll = (): Promise<MergedCatalog> => {
    if (!merged) {
      merged = (async () => {
        const out: MergedCatalog = { services: {}, solutions: {} };
        // Iterate in reverse so earlier sources override later ones.
        for (const source of [...sources].reverse()) {
          const manifest = await source.load();
          Object.assign(out.services, manifest.services ?? {});
          Object.assign(out.solutions, manifest.solutions ?? {});
        }
        return out;
      })();
    }
    return merged;
  };

  const requireSources = (what: string, name: string): void => {
    if (sources.length === 0) {
      throw new Error(
        `${what} "${name}" was requested but no catalog sources are configured. ` +
          `Add a \`catalog: { sources: [...] }\` to kaupang.config.ts.`,
      );
    }
  };

  return {
    async resolve(name) {
      requireSources("Catalog preset", name);
      const { services } = await loadAll();
      const spec = services[name];
      if (!spec) {
        const available = Object.keys(services).sort().join(", ") || "(none)";
        throw new Error(`Catalog preset "${name}" not found. Available: ${available}.`);
      }
      return structuredClone(spec);
    },
    async list() {
      return Object.keys((await loadAll()).services).sort();
    },
    async resolveSolution(name) {
      requireSources("Solution", name);
      const { solutions } = await loadAll();
      const recipe = solutions[name];
      if (!recipe) {
        const available = Object.keys(solutions).sort().join(", ") || "(none)";
        throw new Error(`Solution "${name}" not found in catalog. Available: ${available}.`);
      }
      return structuredClone(recipe);
    },
    async listSolutions() {
      return Object.keys((await loadAll()).solutions).sort();
    },
  };
}
