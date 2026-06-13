import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploymentRecord } from "../src/ledger/ledger.js";
import {
  appendDeployment,
  history,
  latestSuccessful,
  newDeploymentId,
  readLedger,
  rollbackTarget,
} from "../src/ledger/ledger.js";

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "kaupang-ledger-"));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

function record(id: string, status: DeploymentRecord["status"] = "succeeded"): DeploymentRecord {
  return {
    id,
    environment: "market",
    target: "local",
    backend: "compose",
    project: "longhall",
    ranAt: "2026-06-12T00:00:00Z",
    status,
    images: [],
    files: [],
    up: [],
    down: [],
  };
}

describe("readLedger", () => {
  it("returns an empty ledger when none exists", () => {
    expect(readLedger(cacheDir)).toEqual({ version: 1, deployments: {} });
  });

  it("tolerates a corrupt ledger file", () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "ledger.json"), "not json{");
    expect(readLedger(cacheDir)).toEqual({ version: 1, deployments: {} });
  });
});

describe("appendDeployment / history", () => {
  it("round-trips records keyed by environment@target", () => {
    appendDeployment(cacheDir, record("a"));
    appendDeployment(cacheDir, record("b"));
    expect(history(cacheDir, "market", "local").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("scopes history by target", () => {
    appendDeployment(cacheDir, record("a"));
    expect(history(cacheDir, "market", "asgard")).toEqual([]);
  });

  it("caps history at 25 records, keeping the most recent", () => {
    for (let i = 0; i < 30; i++) appendDeployment(cacheDir, record(`r${i}`));
    const ids = history(cacheDir, "market", "local").map((r) => r.id);
    expect(ids).toHaveLength(25);
    expect(ids[0]).toBe("r5");
    expect(ids.at(-1)).toBe("r29");
  });
});

describe("latestSuccessful", () => {
  it("returns the most recent succeeded record, skipping failures", () => {
    appendDeployment(cacheDir, record("a", "succeeded"));
    appendDeployment(cacheDir, record("b", "succeeded"));
    appendDeployment(cacheDir, record("c", "failed"));
    expect(latestSuccessful(cacheDir, "market", "local")!.id).toBe("b");
  });

  it("returns undefined when nothing succeeded", () => {
    appendDeployment(cacheDir, record("a", "failed"));
    expect(latestSuccessful(cacheDir, "market", "local")).toBeUndefined();
  });
});

describe("rollbackTarget", () => {
  it("returns the second-most-recent successful deployment by default", () => {
    appendDeployment(cacheDir, record("a", "succeeded"));
    appendDeployment(cacheDir, record("b", "succeeded"));
    appendDeployment(cacheDir, record("c", "succeeded"));
    expect(rollbackTarget(cacheDir, "market", "local")!.id).toBe("b");
  });

  it("returns an exact successful record when given an id", () => {
    appendDeployment(cacheDir, record("a", "succeeded"));
    appendDeployment(cacheDir, record("b", "succeeded"));
    expect(rollbackTarget(cacheDir, "market", "local", "a")!.id).toBe("a");
  });

  it("returns undefined when there is no prior successful deployment", () => {
    appendDeployment(cacheDir, record("a", "succeeded"));
    expect(rollbackTarget(cacheDir, "market", "local")).toBeUndefined();
  });
});

describe("newDeploymentId", () => {
  it("produces a sortable timestamped id with a random suffix", () => {
    const id = newDeploymentId(new Date("2026-06-12T10:30:45.123Z"));
    expect(id).toMatch(/^20260612T103045Z-[a-z0-9]{4}$/);
  });
});
