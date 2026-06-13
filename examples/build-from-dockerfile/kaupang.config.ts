import { defineConfig } from "kaupang";

// A service built from a local Dockerfile instead of a registry image.
export default defineConfig({
  environments: "./environments",
  project: "build-demo",
});
