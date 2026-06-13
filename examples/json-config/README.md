# json-config

The same idea as `minimal`, authored in JSON instead of TypeScript. kaupang loads
`.ts`, `.mjs`, `.js`, and `.json` configs. In JSON there are no helper functions, so
`secret()` / `use()` become literal tags:

- `secret("WEB_TOKEN")` → `{ "$secret": "WEB_TOKEN" }`
- `use("postgres")` → `{ "$catalog": "postgres" }`

```bash
kaupang up web --dry-run --cwd examples/json-config   # TOKEN renders as ${WEB_TOKEN}

$env:WEB_TOKEN = "s3cr3t"
kaupang up web --cwd examples/json-config             # http://localhost:8080
kaupang down web --cwd examples/json-config
```
