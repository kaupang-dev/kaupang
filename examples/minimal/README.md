# minimal

The smallest kaupang config: a single service from a public image, deployed to local
Docker via Compose.

```bash
kaupang up web --cwd examples/minimal       # then open http://localhost:8080
kaupang down web --cwd examples/minimal
```

See the generated plan without running anything:

```bash
kaupang up web --dry-run --cwd examples/minimal
```
