import { afterEach, describe, expect, it } from "vitest";
import { run, setVerbose } from "../src/util/exec.js";
import { captureConsola } from "./helpers/consola.js";

// `node -e 0` is an instant, output-free command — enough to drive the real
// executor while we assert only on what it echoes through consola.
const node = process.execPath;

afterEach(() => setVerbose(false));

describe("command echo (verbose)", () => {
  it("does not echo the underlying command by default", async () => {
    const out = await captureConsola(() => run(node, ["-e", "0"], { cwd: process.cwd() }));
    expect(out).not.toContain("-e");
  });

  it("echoes the command when verbose is on", async () => {
    setVerbose(true);
    const out = await captureConsola(() => run(node, ["-e", "0"], { cwd: process.cwd() }));
    expect(out).toContain("-e 0");
  });

  it("always echoes on dry-run, even with verbose off", async () => {
    setVerbose(false);
    const out = await captureConsola(() =>
      run("docker", ["compose", "up"], { cwd: process.cwd(), dryRun: true }),
    );
    expect(out).toContain("docker compose up");
  });
});
