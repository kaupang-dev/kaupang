import { describe, expect, it } from "vitest";
import type { BackendAction } from "../src/backends/types.js";
import type { KaupangConfig } from "../src/config/types.js";
import { applyTarget, resolveTarget } from "../src/target/target.js";

const base: KaupangConfig = { environments: "envs" };

describe("resolveTarget", () => {
  it("treats 'local' as an implicit empty target", () => {
    const rt = resolveTarget(base, "local", "/root");
    expect(rt.name).toBe("local");
    expect(rt.env).toEqual({});
    expect(rt.dockerContextArgs).toEqual([]);
    expect(rt.processEnv).toEqual({});
  });

  it("throws on an unknown configured target", () => {
    expect(() => resolveTarget({ ...base, targets: {} }, "prod", "/root")).toThrow(
      /Unknown target/,
    );
  });

  it("builds context args and process env from a configured target", () => {
    const cfg: KaupangConfig = {
      ...base,
      targets: {
        asgard: {
          backend: "swarm",
          pull: "always",
          env: { X: "1" },
          dockerContext: "prod-ctx",
          kubeContext: "prod-kube",
          dockerHost: "ssh://deploy@host",
          kubeconfig: "./kube.yaml",
        },
      },
    };
    const rt = resolveTarget(cfg, "asgard", "/root");

    expect(rt.backend).toBe("swarm");
    expect(rt.pull).toBe("always");
    expect(rt.env).toEqual({ X: "1" });
    expect(rt.dockerContextArgs).toEqual(["--context", "prod-ctx"]);
    expect(rt.kubectlContextArgs).toEqual(["--context", "prod-kube"]);
    expect(rt.processEnv.DOCKER_HOST).toBe("ssh://deploy@host");
    expect(rt.processEnv.KUBECONFIG).toMatch(/kube\.yaml$/);
  });
});

describe("applyTarget", () => {
  const cfg: KaupangConfig = {
    ...base,
    targets: {
      asgard: { dockerContext: "prod-ctx", kubeContext: "prod-kube", dockerHost: "tcp://h:1" },
    },
  };
  const rt = resolveTarget(cfg, "asgard", "/root");

  function action(file: string, args: string[]): BackendAction {
    return { description: "d", file, args };
  }

  it("prepends docker context args to docker commands", () => {
    const applied = applyTarget(action("docker", ["compose", "up"]), rt);
    expect(applied.args).toEqual(["--context", "prod-ctx", "compose", "up"]);
    expect(applied.env).toEqual({ DOCKER_HOST: "tcp://h:1" });
  });

  it("prepends kube context args to kubectl commands", () => {
    const applied = applyTarget(action("kubectl", ["apply", "-f", "m.yaml"]), rt);
    expect(applied.args).toEqual(["--context", "prod-kube", "apply", "-f", "m.yaml"]);
  });

  it("leaves other binaries untouched", () => {
    const applied = applyTarget(action("oras", ["push", "ref"]), rt);
    expect(applied.args).toEqual(["push", "ref"]);
  });

  it("preserves stdin input and omits env for the local target", () => {
    const local = resolveTarget(base, "local", "/root");
    const applied = applyTarget(
      { description: "d", file: "kubectl", args: ["apply", "-f", "-"], input: "yaml" },
      local,
    );
    expect(applied.args).toEqual(["apply", "-f", "-"]);
    expect(applied.input).toBe("yaml");
    expect(applied.env).toBeUndefined();
  });
});
