import { defineEnvironment } from "kaupang";

export default defineEnvironment({
  services: {
    // `build` is a context relative to the repo root (kaupang passes Compose
    // --project-directory so it resolves there); `image` is the tag it produces.
    api: {
      build: "./services/api",
      image: "build-demo-api",
      ports: ["8080:3000"],
    },
  },
});
