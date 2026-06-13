import { describe, expect, it } from "vitest";
import {
  renderQueue,
  renderStepDone,
  renderStepFailed,
  renderStepStart,
  renderSummary,
} from "../src/run/progress.js";
import { deploymentPlan, envPlan } from "./helpers/executor.js";
import { stripAnsi } from "./helpers/consola.js";

const market = envPlan(
  "market",
  { migrate: { image: "a" }, web: { image: "a" } },
  { dependsOn: ["saga"], order: ["migrate", "web"], waves: [["migrate"], ["web"]] },
);
const plan = deploymentPlan([envPlan("saga", { store: { image: "pg" } }), market], {
  target: "market",
  backend: "compose",
});

describe("renderQueue", () => {
  const out = stripAnsi(renderQueue(plan, "local"));

  it("shows the target, backend, and environment count", () => {
    expect(out).toContain("market");
    expect(out).toContain("compose → local");
    expect(out).toContain("queue · 2 environments");
  });

  it("lists environments in order with their service waves and deps", () => {
    expect(out).toContain("1/2");
    expect(out).toContain("saga");
    expect(out).toContain("store");
    // wave order rendered as "a → b"
    expect(out).toContain("migrate → web");
    expect(out).toContain("← saga");
  });
});

describe("step + summary lines", () => {
  it("marks a step started", () => {
    expect(stripAnsi(renderStepStart(1, 2, market))).toContain("[1/2] market");
  });

  it("formats elapsed time (s and ms)", () => {
    expect(stripAnsi(renderStepDone(2, 2, market, 5800))).toContain("[2/2] market (5.8s)");
    expect(stripAnsi(renderStepDone(2, 2, market, 800))).toContain("(800ms)");
  });

  it("marks a failed step", () => {
    expect(stripAnsi(renderStepFailed(2, 2, market))).toContain("[2/2] market failed");
  });

  it("summarizes the completed deploy", () => {
    const out = stripAnsi(renderSummary(plan, "local", 12000));
    expect(out).toContain("stands on local");
    expect(out).toContain("2/2 up");
    expect(out).toContain("saga, market");
  });
});
