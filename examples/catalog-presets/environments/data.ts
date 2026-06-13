import { defineEnvironment, use } from "kaupang";

// `use("name")` pulls a preset from the catalog. Pass a second argument to override
// fields (env, ports, …) for this particular use.
export default defineEnvironment({
  services: {
    db: use("postgres", { env: { POSTGRES_DB: "catalog_demo" } }),
    cache: use("redis"),
  },
});
