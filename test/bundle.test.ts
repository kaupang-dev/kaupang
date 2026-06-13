import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BackendAction } from "../src/backends/types.js";
import {
  isOciRef,
  readBundle,
  rewriteActionPath,
  writeBundle,
  type BundleManifest,
} from "../src/solution/bundle.js";

describe("isOciRef", () => {
  it("recognizes oci:// references", () => {
    expect(isOciRef("oci://ghcr.io/acme/bundle:1")).toBe(true);
    expect(isOciRef("/local/bundle/dir")).toBe(false);
  });
});

describe("rewriteActionPath", () => {
  it("rewrites only the matching file argument, leaving the original intact", () => {
    const action: BackendAction = {
      description: "compose up",
      file: "docker",
      args: ["compose", "-f", "/abs/docker-compose.yml", "up"],
    };
    const rewritten = rewriteActionPath(action, "/abs/docker-compose.yml", "market/docker-compose.yml");
    expect(rewritten.args).toEqual(["compose", "-f", "market/docker-compose.yml", "up"]);
    // original is not mutated
    expect(action.args[2]).toBe("/abs/docker-compose.yml");
  });
});

describe("writeBundle / readBundle", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kaupang-bundle-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const manifest: BundleManifest = {
    kaupang: "0.1.0",
    solution: "longhall-full",
    version: "1.2.3",
    target: "asgard",
    project: "longhall",
    createdAt: "2026-06-12T00:00:00Z",
    images: { included: false, tars: [] },
    environments: [
      {
        name: "market",
        backend: "compose",
        images: [],
        artifact: { relPath: "market/docker-compose.yml", content: "# yaml\nservices: {}\n" },
        up: [
          {
            description: "compose up",
            file: "docker",
            args: ["compose", "-f", "market/docker-compose.yml", "up"],
          },
        ],
        down: [],
      },
    ],
  };

  it("round-trips the manifest", () => {
    writeBundle(dir, manifest);
    expect(readBundle(dir)).toEqual(manifest);
  });

  it("writes each environment's artifact to its bundle-relative path", () => {
    writeBundle(dir, manifest);
    const artifact = join(dir, "market", "docker-compose.yml");
    expect(existsSync(artifact)).toBe(true);
    expect(readFileSync(artifact, "utf8")).toBe("# yaml\nservices: {}\n");
  });

  it("rejects a directory that is not a bundle", () => {
    expect(() => readBundle(dir)).toThrow(/Not a kaupang bundle/);
  });
});
