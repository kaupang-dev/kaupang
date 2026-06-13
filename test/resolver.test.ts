import { describe, expect, it } from "vitest";
import type { ResolvedEnvironment } from "../src/config/loader.js";
import type { ServiceDefinition } from "../src/config/types.js";
import {
  resolveMultiPlan,
  resolvePlan,
  topoSort,
} from "../src/graph/resolver.js";

function deps(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

function env(
  name: string,
  services: Record<string, ServiceDefinition>,
  dependsOn: string[] = [],
): ResolvedEnvironment {
  return { name, file: `${name}.ts`, services, dependsOn, env: {} };
}

describe("topoSort", () => {
  it("orders a linear chain and groups it into single-node waves", () => {
    const { order, waves } = topoSort(["a", "b", "c"], deps({ b: ["a"], c: ["b"] }), "node");
    expect(order).toEqual(["a", "b", "c"]);
    expect(waves).toEqual([["a"], ["b"], ["c"]]);
  });

  it("groups independent nodes into the same wave, sorted deterministically", () => {
    const { order, waves } = topoSort(["c", "a", "b"], deps({}), "node");
    expect(order).toEqual(["a", "b", "c"]);
    expect(waves).toEqual([["a", "b", "c"]]);
  });

  it("puts a node depending on two others in a later wave", () => {
    const { waves } = topoSort(["a", "b", "c"], deps({ c: ["a", "b"] }), "node");
    expect(waves).toEqual([["a", "b"], ["c"]]);
  });

  it("throws on cycles", () => {
    expect(() => topoSort(["a", "b"], deps({ a: ["b"], b: ["a"] }), "node")).toThrow(/cycle/i);
  });

  it("throws on references to unknown nodes", () => {
    expect(() => topoSort(["a"], deps({ a: ["x"] }), "node")).toThrow(/unknown/);
  });
});

describe("resolvePlan", () => {
  const environments = new Map<string, ResolvedEnvironment>([
    ["saga", env("saga", { store: { image: "postgres" } })],
    [
      "market",
      env(
        "market",
        {
          herald: { image: "herald", dependsOn: ["runecarver"] },
          runecarver: { image: "runecarver" },
        },
        ["saga"],
      ),
    ],
  ]);

  it("includes transitive env deps in dependency order", () => {
    const plan = resolvePlan("market", environments, "compose");
    expect(plan.target).toBe("market");
    expect(plan.backend).toBe("compose");
    expect(plan.environments.map((e) => e.name)).toEqual(["saga", "market"]);
  });

  it("orders services within an environment", () => {
    const plan = resolvePlan("market", environments, "compose");
    const market = plan.environments.find((e) => e.name === "market")!;
    expect(market.order).toEqual(["runecarver", "herald"]);
    expect(market.waves).toEqual([["runecarver"], ["herald"]]);
  });

  it("throws on an unknown environment", () => {
    expect(() => resolvePlan("nope", environments, "compose")).toThrow(/Unknown environment/);
  });

  it("throws when a service depends on an unknown service", () => {
    const broken = new Map<string, ResolvedEnvironment>([
      ["x", env("x", { a: { image: "a", dependsOn: ["ghost"] } })],
    ]);
    expect(() => resolvePlan("x", broken, "compose")).toThrow(/unknown service/);
  });

  it("detects environment dependency cycles", () => {
    const cyclic = new Map<string, ResolvedEnvironment>([
      ["a", env("a", { s: { image: "a" } }, ["b"])],
      ["b", env("b", { s: { image: "b" } }, ["a"])],
    ]);
    expect(() => resolvePlan("a", cyclic, "compose")).toThrow(/cycle/i);
  });
});

describe("resolveMultiPlan", () => {
  it("resolves several roots and their shared deps", () => {
    const environments = new Map<string, ResolvedEnvironment>([
      ["saga", env("saga", { store: { image: "postgres" } })],
      ["runes", env("runes", { cache: { image: "redis" } })],
      ["market", env("market", { herald: { image: "herald" } }, ["saga", "runes"])],
    ]);
    const plan = resolveMultiPlan(["market"], "longhall-full", environments, "swarm");
    expect(plan.target).toBe("longhall-full");
    expect(plan.environments.map((e) => e.name)).toEqual(["runes", "saga", "market"]);
  });
});
