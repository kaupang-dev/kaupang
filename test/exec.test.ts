import { describe, expect, it } from "vitest";
import { parseDuration } from "../src/util/exec.js";

describe("parseDuration", () => {
  it("parses explicit units", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("2s")).toBe(2000);
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("treats unitless strings as seconds", () => {
    expect(parseDuration("5")).toBe(5000);
  });

  it("treats bare numbers as seconds", () => {
    expect(parseDuration(2)).toBe(2000);
  });

  it("accepts fractional values and surrounding whitespace", () => {
    expect(parseDuration("1.5s")).toBe(1500);
    expect(parseDuration("  2s  ")).toBe(2000);
  });

  it("rejects malformed durations", () => {
    expect(() => parseDuration("abc")).toThrow(/Invalid duration/);
    expect(() => parseDuration("2x")).toThrow(/Invalid duration/);
    expect(() => parseDuration("")).toThrow(/Invalid duration/);
  });
});
