import { describe, expect, it } from "vitest";
import type { CatalogResolver } from "../src/catalog/source.js";
import type { KaupangConfig, SolutionRecipe } from "../src/config/types.js";
import type { DeploymentPlan } from "../src/graph/resolver.js";
import { applyPins, resolveSolution } from "../src/solution/solution.js";

const noCatalog: CatalogResolver = {
  async resolve() {
    throw new Error("no presets");
  },
  async list() {
    return [];
  },
  async resolveSolution() {
    throw new Error("no catalog configured");
  },
  async listSolutions() {
    return [];
  },
};

function catalogWith(name: string, recipe: SolutionRecipe): CatalogResolver {
  return {
    ...noCatalog,
    async resolveSolution(n) {
      if (n === name) return recipe;
      throw new Error("not found");
    },
  };
}

const base: KaupangConfig = { environments: "envs" };

describe("resolveSolution", () => {
  it("resolves an inline solution recipe", async () => {
    const config: KaupangConfig = {
      ...base,
      solutions: {
        full: {
          version: "2",
          environments: ["market"],
          pins: { "market.web": "img@sha" },
          env: { X: "1" },
          target: "asgard",
        },
      },
    };
    const sol = await resolveSolution(config, noCatalog, "full");
    expect(sol).toEqual({
      name: "full",
      version: "2",
      environments: ["market"],
      pins: { "market.web": "img@sha" },
      env: { X: "1" },
      target: "asgard",
    });
  });

  it("prefers an inline solution over the catalog", async () => {
    const config: KaupangConfig = {
      ...base,
      solutions: { full: { environments: ["inline-env"] } },
    };
    const catalog = catalogWith("full", { environments: ["catalog-env"] });
    const sol = await resolveSolution(config, catalog, "full");
    expect(sol.environments).toEqual(["inline-env"]);
  });

  it("falls back to the catalog when not declared inline", async () => {
    const catalog = catalogWith("hosted", { environments: ["market"], version: "9" });
    const sol = await resolveSolution(base, catalog, "hosted");
    expect(sol.environments).toEqual(["market"]);
    expect(sol.version).toBe("9");
  });

  it("throws when a solution is found nowhere", async () => {
    await expect(resolveSolution(base, noCatalog, "ghost")).rejects.toThrow(/Unknown solution/);
  });

  it("requires at least one environment", async () => {
    const config: KaupangConfig = { ...base, solutions: { empty: { environments: [] } } };
    await expect(resolveSolution(config, noCatalog, "empty")).rejects.toThrow(
      /at least one environment/,
    );
  });
});

describe("applyPins", () => {
  function plan(): DeploymentPlan {
    return {
      target: "market",
      backend: "compose",
      environments: [
        {
          name: "market",
          file: "market.ts",
          env: {},
          dependsOn: [],
          order: [],
          waves: [],
          services: { web: { image: "old" }, api: { image: "api" } },
        },
      ],
    };
  }

  it("overrides service images by env.service key", () => {
    const p = plan();
    applyPins(p, { "market.web": "new@sha" });
    expect(p.environments[0]!.services.web!.image).toBe("new@sha");
    expect(p.environments[0]!.services.api!.image).toBe("api");
  });

  it("throws when a pin does not match any service", () => {
    expect(() => applyPins(plan(), { "market.ghost": "x" })).toThrow(/does not match any service/);
  });

  it("throws on a malformed pin key without a service segment", () => {
    expect(() => applyPins(plan(), { market: "x" })).toThrow(/does not match any service/);
  });
});
