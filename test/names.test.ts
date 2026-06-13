import { describe, expect, it } from "vitest";
import { k8sName, sanitize, stackName } from "../src/util/names.js";

describe("sanitize", () => {
  it("lowercases and keeps legal compose chars", () => {
    expect(sanitize("MyApp")).toBe("myapp");
    expect(sanitize("a_b-c")).toBe("a_b-c");
  });

  it("collapses runs of illegal chars into a single dash", () => {
    expect(sanitize("my app!!name")).toBe("my-app-name");
  });

  it("strips leading/trailing separators", () => {
    expect(sanitize("__weird__")).toBe("weird");
    expect(sanitize("--edge--")).toBe("edge");
  });

  it("falls back to 'default' when nothing survives", () => {
    expect(sanitize("///")).toBe("default");
    expect(sanitize("")).toBe("default");
  });
});

describe("k8sName", () => {
  it("treats underscore as illegal (RFC 1123 label)", () => {
    expect(k8sName("My_Service")).toBe("my-service");
  });

  it("truncates to 63 chars", () => {
    expect(k8sName("a".repeat(70))).toHaveLength(63);
  });

  it("falls back to 'default' when nothing survives", () => {
    expect(k8sName("___")).toBe("default");
  });
});

describe("stackName", () => {
  it("joins sanitized project and env with an underscore", () => {
    expect(stackName("Longhall", "Market")).toBe("longhall_market");
  });
});
