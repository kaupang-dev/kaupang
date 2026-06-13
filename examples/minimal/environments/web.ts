import { defineEnvironment } from "@kaupang/core";

// The environment name defaults to the file name ("web").
export default defineEnvironment({
  services: {
    web: { image: "nginx:alpine", ports: ["8080:80"] },
  },
});
