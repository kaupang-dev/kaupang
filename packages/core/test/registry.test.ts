import { afterEach, describe, expect, it } from "vitest";
import { orasRegistryArgs } from "../src/util/registry.js";

afterEach(() => {
  delete process.env.KAUPANG_ORAS_PLAIN_HTTP;
});

describe("orasRegistryArgs", () => {
  it("uses plain HTTP for localhost / loopback registries", () => {
    expect(orasRegistryArgs("localhost:5000/x:1")).toEqual(["--plain-http"]);
    expect(orasRegistryArgs("127.0.0.1:5000/x:1")).toEqual(["--plain-http"]);
    expect(orasRegistryArgs("oci://localhost:5000/bundles/x:1")).toEqual(["--plain-http"]);
  });

  it("stays on HTTPS for public registries", () => {
    expect(orasRegistryArgs("ghcr.io/acme/x:1")).toEqual([]);
    expect(orasRegistryArgs("myreg.azurecr.io/bundles/x:1")).toEqual([]);
  });

  it("honors the KAUPANG_ORAS_PLAIN_HTTP opt-in for non-local registries", () => {
    process.env.KAUPANG_ORAS_PLAIN_HTTP = "1";
    expect(orasRegistryArgs("registry.internal:5000/x:1")).toEqual(["--plain-http"]);
  });
});
