import { defineEnvironment } from "@kaupang/core";

export default defineEnvironment({
  services: {
    web: { image: "nginx:alpine", ports: ["8080:80"] },
  },
});
