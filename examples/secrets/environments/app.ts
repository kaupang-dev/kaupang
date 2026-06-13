import { defineEnvironment, secret } from "kaupang";

// `secret("VAR")` is emitted as `${VAR}` in the generated compose file (Docker
// resolves it from the host env at deploy time) and as a `secretKeyRef` for the
// kubernetes backend. The value is never written to the artifact or the ledger, and
// the CLI fails fast if the variable isn't set in your shell.
export default defineEnvironment({
  services: {
    api: {
      image: "nginx:alpine",
      ports: ["8080:80"],
      env: {
        PUBLIC_NAME: "secrets-demo", // a plain literal
        API_TOKEN: secret("API_TOKEN"), // sourced from $API_TOKEN at deploy time
      },
    },
  },
});
