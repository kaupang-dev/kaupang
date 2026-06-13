import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";
import { makeContext } from "../src/context.js";
import { resolvePlan } from "../src/graph/resolver.js";
import { renderPlan } from "../src/render/plan.js";
import { runPipeline } from "../src/run/pipeline.js";
import { resolveTarget } from "../src/target/target.js";
import { captureConsola } from "./helpers/consola.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string): string => join(fixtures, name);

describe("loadConfig over a fixture repo", () => {
  it("discovers and normalizes every environment", async () => {
    const loaded = await loadConfig(fixture("good"));
    expect([...loaded.environments.keys()].sort()).toEqual(["market", "saga"]);
    expect(loaded.project).toBe("longhall");
  });
});

describe("up --dry-run rendering", () => {
  it("renders the env order, service waves, and the compose command", async () => {
    const loaded = await loadConfig(fixture("good"));
    const plan = resolvePlan("market", loaded.environments, "compose");
    const ctx = makeContext(loaded);

    const out = await captureConsola(() => renderPlan(plan, ctx));

    expect(out).toContain("Deployment plan");
    // dependency order: saga listed before market in the env start order
    const orderSection = out.slice(out.indexOf("Environment start order"), out.indexOf("Service graph"));
    expect(orderSection.indexOf("saga")).toBeLessThan(orderSection.indexOf("market"));
    // service wave order within market: runecarver before web
    const graphSection = out.slice(out.indexOf("Service graph"), out.indexOf("Commands that would run"));
    expect(graphSection.indexOf("runecarver")).toBeLessThan(graphSection.indexOf("web"));
    expect(out).toContain("docker compose");
    expect(out).toContain("up -d --wait");
  });

  it("applies the target's docker context to the rendered swarm command", async () => {
    const loaded = await loadConfig(fixture("good"));
    const rt = resolveTarget(loaded.config, "asgard", loaded.rootDir);
    const plan = resolvePlan("market", loaded.environments, "swarm");
    const ctx = makeContext(loaded, { targetEnv: rt.env });

    const out = await captureConsola(() => renderPlan(plan, ctx, rt));

    expect(out).toContain("docker --context prod stack deploy");
  });
});

describe("dry-run over deliberately broken repos", () => {
  it("reports an environment dependency cycle", async () => {
    const loaded = await loadConfig(fixture("cycle"));
    expect(() => resolvePlan("a", loaded.environments, "compose")).toThrow(/cycle/i);
  });

  it("reports a service that depends on an unknown service", async () => {
    const loaded = await loadConfig(fixture("missing-dep"));
    expect(() => resolvePlan("market", loaded.environments, "compose")).toThrow(/unknown service/);
  });

  it("rejects a pipeline step that declares two actions", async () => {
    const loaded = await loadConfig(fixture("two-action"));
    await expect(runPipeline(loaded, "bad", { dryRun: true })).rejects.toThrow(/exactly one of/);
  });
});
