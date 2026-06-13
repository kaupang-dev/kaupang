import { defineConfig } from "kaupang";

// The smallest possible kaupang setup: one environment, one service, deployed to
// your local Docker via Compose. Run: `kaupang up web --cwd examples/minimal`.
export default defineConfig({
  environments: "./environments",
  project: "minimal",
});
