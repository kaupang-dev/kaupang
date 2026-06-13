# catalog-presets

Reusable service definitions via `use()`. The `postgres` and `redis` presets live in
`catalog.json`; environments reference them by name and override fields as needed —
so a fleet of repos can share one source of truth for "what a postgres looks like."

```bash
kaupang up data --cwd examples/catalog-presets
kaupang down data --with-deps --cwd examples/catalog-presets
```

The `db` service overrides `POSTGRES_DB` for this use; `cache` takes the preset as-is.
Swap the `file` source for an `http`, `service`, or `oci` source to share the catalog
across machines.
