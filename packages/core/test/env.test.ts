import { describe, expect, it } from "vitest";
import {
  isSecret,
  mergeEnv,
  renderComposeEnv,
  requiredSecretVars,
} from "../src/util/env.js";

describe("isSecret", () => {
  it("recognizes secret references", () => {
    expect(isSecret({ $secret: "TOKEN" })).toBe(true);
  });

  it("rejects plain string values", () => {
    expect(isSecret("plain")).toBe(false);
  });
});

describe("mergeEnv", () => {
  it("merges left to right with later maps winning", () => {
    expect(mergeEnv({ A: "1", B: "1" }, { B: "2" })).toEqual({ A: "1", B: "2" });
  });

  it("skips undefined maps", () => {
    expect(mergeEnv({ A: "1" }, undefined, { C: "3" })).toEqual({ A: "1", C: "3" });
  });

  it("preserves secret references", () => {
    const merged = mergeEnv({ A: { $secret: "X" } }, { B: "lit" });
    expect(merged.A).toEqual({ $secret: "X" });
  });
});

describe("renderComposeEnv", () => {
  it("passes literals through and renders secrets as ${VAR} refs", () => {
    const rendered = renderComposeEnv({ LOG: "info", TOKEN: { $secret: "API_TOKEN" } });
    expect(rendered).toEqual({ LOG: "info", TOKEN: "${API_TOKEN}" });
  });

  it("never emits a secret's value into the rendered map", () => {
    const rendered = renderComposeEnv({ TOKEN: { $secret: "API_TOKEN" } });
    expect(JSON.stringify(rendered)).not.toContain("$secret");
  });
});

describe("requiredSecretVars", () => {
  it("collects distinct host var names across maps", () => {
    const vars = requiredSecretVars(
      { A: { $secret: "X" }, B: "lit" },
      { C: { $secret: "X" }, D: { $secret: "Y" } },
    );
    expect([...vars].sort()).toEqual(["X", "Y"]);
  });

  it("returns nothing when no secrets are referenced", () => {
    expect(requiredSecretVars({ A: "1" }, undefined)).toEqual([]);
  });
});
