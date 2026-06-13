import { defineEnvironment, secret } from "@kaupang/core";

// Provide prebuilt images for the kubernetes backend (no build contexts here).
// `replicas` maps to the Deployment's replica count; `ports` adds a Service;
// secrets become a secretKeyRef into the `<project>-secrets` Secret.
export default defineEnvironment({
  services: {
    api: {
      image: "nginx:alpine",
      ports: ["80"],
      replicas: 2,
      env: { API_TOKEN: secret("API_TOKEN") },
    },
  },
});
