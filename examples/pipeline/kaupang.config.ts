import { defineConfig } from "kaupang";

// A pipeline is an ordered DAG of steps: run a command, deploy an environment, wait
// for a condition, etc. `needs` wires the dependencies; kaupang topo-sorts them.
export default defineConfig({
  environments: "./environments",
  project: "pipeline-demo",
  pipelines: {
    deploy: {
      steps: {
        notify: { run: "echo 'starting deploy…'" },
        web: { up: "web", needs: "notify" },
        smoke: { wait: { http: "http://localhost:8080", timeout: "30s" }, needs: "web" },
        done: { run: "echo 'deploy complete ✅'", needs: "smoke" },
      },
    },
  },
});
