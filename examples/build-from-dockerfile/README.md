# build-from-dockerfile

A service built from a local `Dockerfile` (a `build:` context) instead of a registry
image. The relative context resolves from the repo root — kaupang passes Compose's
`--project-directory` so `./services/api` works even though the generated compose file
lives under `.kaupang/`.

```bash
kaupang build app --cwd examples/build-from-dockerfile
kaupang up app --cwd examples/build-from-dockerfile     # http://localhost:8080
kaupang down app --cwd examples/build-from-dockerfile
```

`kaupang up` will build the image if it doesn't exist yet, so you can skip the
explicit `build` step for a first run.
