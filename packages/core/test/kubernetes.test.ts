import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import type { ServiceDefinition } from "../src/config/types.js";
import type { EnvironmentPlan } from "../src/graph/resolver.js";
import type { BackendContext } from "../src/backends/types.js";
import { kubernetesBackend } from "../src/backends/kubernetes.js";

function plan(services: Record<string, ServiceDefinition>): EnvironmentPlan {
  return {
    name: "market",
    file: "market.ts",
    env: {},
    dependsOn: [],
    order: [],
    waves: [],
    services,
  };
}

const ctx: BackendContext = {
  rootDir: "/r",
  cacheDir: "/r/.kaupang",
  project: "longhall",
  baseEnv: {},
  targetEnv: {},
};

describe("kubernetesBackend.materialize", () => {
  const mat = kubernetesBackend.materialize(
    plan({
      herald: {
        image: "ghcr.io/x/herald",
        ports: ["8080:80"],
        env: { KEY: { $secret: "LONGHALL_JARL_KEY" }, LOG: "info" },
      },
      worker: { image: "ghcr.io/x/worker" },
    }),
    ctx,
  );
  const docs = parseAllDocuments(mat.files[0]!.content).map((d) => d.toJSON());

  it("writes a single manifest under the namespaced cache dir", () => {
    expect(mat.files).toHaveLength(1);
    expect(mat.files[0]!.path).toContain("longhall-market");
    expect(mat.files[0]!.path).toContain("manifest.yaml");
  });

  it("emits kubectl apply / delete actions for the namespace", () => {
    expect(mat.up[0]).toMatchObject({ file: "kubectl", args: ["apply", "-f", expect.any(String)] });
    expect(mat.down[0]!.args).toEqual([
      "delete",
      "namespace",
      "longhall-market",
      "--ignore-not-found",
    ]);
  });

  it("renders Namespace + a Deployment per service + a Service per ported service", () => {
    const kinds = docs.map((d) => d.kind);
    expect(kinds).toEqual(["Namespace", "Deployment", "Service", "Deployment"]);
  });

  it("names and labels the namespace", () => {
    const ns = docs.find((d) => d.kind === "Namespace");
    expect(ns.metadata.name).toBe("longhall-market");
    expect(ns.metadata.labels["app.kubernetes.io/managed-by"]).toBe("kaupang");
  });

  it("references secrets via secretKeyRef and keeps literals inline", () => {
    const dep = docs.find((d) => d.kind === "Deployment" && d.metadata.name === "herald");
    const env = dep.spec.template.spec.containers[0].env;
    expect(env).toContainEqual({ name: "LOG", value: "info" });
    expect(env).toContainEqual({
      name: "KEY",
      valueFrom: { secretKeyRef: { name: "longhall-secrets", key: "LONGHALL_JARL_KEY" } },
    });
  });

  it("never writes a secret marker into the manifest", () => {
    expect(mat.files[0]!.content).not.toContain("$secret");
  });

  it("maps host:container ports onto the Service", () => {
    const svc = docs.find((d) => d.kind === "Service");
    expect(svc.spec.ports).toEqual([{ port: 8080, targetPort: 80 }]);
  });

  it("defaults replicas to 1", () => {
    const worker = docs.find((d) => d.kind === "Deployment" && d.metadata.name === "worker");
    expect(worker.spec.replicas).toBe(1);
  });

  it("requires an image (build contexts are unsupported)", () => {
    expect(() => kubernetesBackend.materialize(plan({ web: { ports: ["80"] } }), ctx)).toThrow(
      /needs an "image"/,
    );
  });
});
