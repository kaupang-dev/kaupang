import type { Edge } from "@xyflow/react";
import type { ServiceDef, ServiceNodeType } from "../types";

export interface ExportFile {
  path: string;
  content: string;
}

// Mirror of the server's sourceFor(): a catalog string → a kaupang CatalogSourceConfig.
function sourceFor(catalog: string): Record<string, string> {
  if (/^https?:\/\//.test(catalog)) return { type: "http", url: catalog };
  if (catalog.startsWith("oci://")) return { type: "oci", ref: catalog.slice("oci://".length) };
  return { type: "file", path: catalog };
}

// Fields the studio can edit; they're what we diff/inline. Anything else on a catalog
// preset stays in the catalog (referenced via $catalog), not duplicated into the config.
const FIELDS = [
  "image",
  "build",
  "ports",
  "command",
  "entrypoint",
  "workingDirectory",
  "volumes",
  "networks",
  "env",
  "runOnce",
] as const;

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const blank = (v: unknown) =>
  v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v as object).length === 0);

function pick(def: ServiceDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FIELDS) if (!blank(def[key])) out[key] = def[key];
  return out;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

// Turn the live graph into a runnable kaupang config: one environments/<env>.json per
// used environment + a top-level kaupang.config.json. Dependencies come from the canvas
// edges (A→B = A depends on B): same-env edges → service `dependsOn`, cross-env edges →
// environment `dependsOn`. Catalog-linked services emit `$catalog` + only the fields the
// user changed from the preset (as `overrides`); local services inline their definition.
export function buildExport(opts: {
  services: ServiceNodeType[];
  edges: Edge[];
  environments: string[];
  envDeps: Record<string, string[]>;
  presets: Record<string, ServiceDef>;
  source: string;
  project: string;
  solution: string;
}): ExportFile[] {
  const { services, edges, environments, envDeps, presets, source, project, solution } = opts;
  const byId = new Map(services.map((s) => [s.id, s]));
  const svcDeps = new Map<string, Set<string>>(services.map((s) => [s.id, new Set<string>()]));
  // Environment-level dependsOn: explicit (e.g. imported) deps, plus any inferred from
  // cross-environment edges drawn on the canvas.
  const edgeEnvDeps = new Map<string, Set<string>>(environments.map((e) => [e, new Set(envDeps[e] ?? [])]));

  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    if (a.data.env === b.data.env) svcDeps.get(a.id)!.add(b.data.label);
    else (edgeEnvDeps.get(a.data.env) ?? edgeEnvDeps.set(a.data.env, new Set()).get(a.data.env)!).add(b.data.env);
  }

  const usedEnvs = environments.filter((env) => services.some((s) => s.data.env === env));
  const files: ExportFile[] = [];

  for (const env of usedEnvs) {
    const servicesObj: Record<string, unknown> = {};
    for (const s of services.filter((s) => s.data.env === env)) {
      const deps = [...(svcDeps.get(s.id) ?? [])];
      if (s.data.local) {
        servicesObj[s.data.label] = { ...pick(s.data.def), ...(deps.length ? { dependsOn: deps } : {}) };
      } else {
        const preset = (s.data.preset && presets[s.data.preset]) || {};
        const changed = pick(s.data.def);
        const overrides: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(changed)) if (!eq(v, preset[k])) overrides[k] = v;
        if (deps.length) overrides.dependsOn = deps;
        servicesObj[s.data.label] = {
          $catalog: s.data.preset,
          ...(Object.keys(overrides).length ? { overrides } : {}),
        };
      }
    }
    const depList = [...(edgeEnvDeps.get(env) ?? [])].filter((e) => e !== env);
    const body: Record<string, unknown> = {};
    if (depList.length) body.dependsOn = depList;
    body.services = servicesObj;
    files.push({ path: `environments/${env}.json`, content: json(body) });
  }

  const config = {
    project,
    catalog: { sources: [sourceFor(source)] },
    environments: "./environments",
    solutions: { [solution]: { environments: usedEnvs } },
  };
  files.unshift({ path: "kaupang.config.json", content: json(config) });
  return files;
}
