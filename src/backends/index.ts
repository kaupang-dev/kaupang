import { composeBackend, swarmBackend } from "./compose.js";
import { kubernetesBackend } from "./kubernetes.js";
import type { BackendName } from "../config/types.js";
import type { Backend } from "./types.js";

const backends: Record<BackendName, Backend> = {
  compose: composeBackend,
  swarm: swarmBackend,
  kubernetes: kubernetesBackend,
};

export function getBackend(name: BackendName): Backend {
  const backend = backends[name];
  if (!backend) {
    throw new Error(
      `Unknown backend "${name}". Use one of: ${Object.keys(backends).join(", ")}.`,
    );
  }
  return backend;
}

export const backendNames = Object.keys(backends) as BackendName[];
