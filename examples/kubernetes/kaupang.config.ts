import { defineConfig } from "kaupang";

// Same definitions, a different backend. The kubernetes backend renders a Namespace
// plus a Deployment (and a Service when ports are declared) per service.
export default defineConfig({
  environments: "./environments",
  project: "k8s-demo",
  defaultBackend: "kubernetes",
});
