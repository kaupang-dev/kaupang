import { describe, expect, it } from "vitest";
import type { CatalogResolver } from "../src/catalog/source.js";
import type { EnvironmentDefinition } from "../src/config/types.js";
import { normalizeEnvironment, resolveImage, toArray } from "../src/config/normalize.js";

const catalog: CatalogResolver = {
  async resolve(name) {
    if (name === "saga-store") {
      return { image: "postgres:16", env: { PGDATA: "/data" } };
    }
    throw new Error(`unknown preset ${name}`);
  },
  async list() {
    return ["saga-store"];
  },
  async resolveSolution() {
    throw new Error("no solutions");
  },
  async listSolutions() {
    return [];
  },
};

describe("resolveImage", () => {
  it("prefixes bare image names with the docker repository", () => {
    expect(resolveImage("web", "ghcr.io/acme")).toBe("ghcr.io/acme/web");
  });

  it("leaves registry-qualified names untouched (host has a dot, port, or is localhost)", () => {
    expect(resolveImage("ghcr.io/other/web", "ghcr.io/acme")).toBe("ghcr.io/other/web");
    expect(resolveImage("localhost:5000/web", "ghcr.io/acme")).toBe("localhost:5000/web");
  });

  it("prefixes namespaced names without a registry host", () => {
    expect(resolveImage("team/web", "ghcr.io/acme")).toBe("ghcr.io/acme/team/web");
  });

  it("strips trailing slashes from the repo", () => {
    expect(resolveImage("web", "ghcr.io/acme/")).toBe("ghcr.io/acme/web");
  });

  it("is a no-op without an image or a repo", () => {
    expect(resolveImage(undefined, "ghcr.io/acme")).toBeUndefined();
    expect(resolveImage("web", undefined)).toBe("web");
  });
});

describe("toArray", () => {
  it("coerces undefined / scalar / array to an array", () => {
    expect(toArray(undefined)).toEqual([]);
    expect(toArray("a")).toEqual(["a"]);
    expect(toArray(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("normalizeEnvironment", () => {
  const def: EnvironmentDefinition = {
    services: {
      web: "web",
      db: { $catalog: "saga-store" },
      worker: { image: "ghcr.io/other/worker", dependsOn: "web" },
    },
    dependsOn: "saga",
    env: { LOG: "info" },
  };

  it("normalizes services, deps, and env", async () => {
    const norm = await normalizeEnvironment(def, "market", "/x/market.ts", {
      dockerRepository: "ghcr.io/acme",
      defaultPull: "missing",
      catalog,
    });

    expect(norm.name).toBe("market");
    expect(norm.file).toBe("/x/market.ts");
    expect(norm.dependsOn).toEqual(["saga"]);
    expect(norm.env).toEqual({ LOG: "info" });
  });

  it("prefixes bare images but leaves catalog and qualified images alone", async () => {
    const norm = await normalizeEnvironment(def, "market", "/x/market.ts", {
      dockerRepository: "ghcr.io/acme",
      defaultPull: "missing",
      catalog,
    });

    expect(norm.services.web!.image).toBe("ghcr.io/acme/web");
    expect(norm.services.db!.image).toBe("postgres:16");
    expect(norm.services.worker!.image).toBe("ghcr.io/other/worker");
  });

  it("coerces dependsOn and fills the default pull policy", async () => {
    const norm = await normalizeEnvironment(def, "market", "/x/market.ts", {
      dockerRepository: "ghcr.io/acme",
      defaultPull: "missing",
      catalog,
    });

    expect(norm.services.worker!.dependsOn).toEqual(["web"]);
    expect(norm.services.web!.pull).toBe("missing");
  });

  it("carries catalog preset env and applies overrides", async () => {
    const withOverride: EnvironmentDefinition = {
      services: {
        db: { $catalog: "saga-store", overrides: { env: { PGDATA: "/custom" } } },
      },
    };
    const norm = await normalizeEnvironment(withOverride, "saga", "/x/saga.ts", { catalog });
    expect(norm.services.db!.env).toEqual({ PGDATA: "/custom" });
  });

  it("lets the environment override docker repository and pull policy", async () => {
    const envLevel: EnvironmentDefinition = {
      services: { web: "web" },
      dockerRepository: "ghcr.io/team",
      pull: "always",
    };
    const norm = await normalizeEnvironment(envLevel, "market", "/x/market.ts", {
      dockerRepository: "ghcr.io/acme",
      defaultPull: "missing",
      catalog,
    });
    expect(norm.services.web!.image).toBe("ghcr.io/team/web");
    expect(norm.services.web!.pull).toBe("always");
  });
});
