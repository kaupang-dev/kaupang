import { defineEnvironment, use } from "kaupang";

// Fast lookups — the rune cache.
export default defineEnvironment({
  name: "runes",
  services: { cache: use("rune-cache", { env: { REDIS_MAXMEMORY: "256mb" } }) },
});
