import { defineEnvironment } from "kaupang";

export default defineEnvironment({
  services: {
    web: { image: "nginx:alpine", ports: ["8080:80"] },
  },
});
