import { defineEnvironment, use } from "kaupang";

// One-liner: the saga store (the ledger) comes straight from the shared catalog.
export default defineEnvironment({
  name: "saga",
  services: { store: use("saga-store") },
});
