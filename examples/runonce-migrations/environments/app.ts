import { defineEnvironment } from "@kaupang/core";

// `runOnce` marks a run-to-completion job (migrations / seed). It is forced to
// `restart: "no"`, and dependents wait for it to finish *successfully* before they
// start — so `up --wait` treats its clean exit as success, not a failure.
export default defineEnvironment({
  services: {
    migrate: {
      image: "alpine:3.20",
      command: ["sh", "-c", "echo 'running migrations…'; sleep 1; echo 'done ✅'"],
      runOnce: true,
    },
    web: {
      image: "nginx:alpine",
      ports: ["8080:80"],
      dependsOn: "migrate", // waits for migrate to complete successfully
    },
  },
});
