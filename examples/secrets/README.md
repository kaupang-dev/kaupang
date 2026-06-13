# secrets

`secret("VAR")` keeps secret values out of the generated artifacts and the ledger.
For Compose/Swarm it renders as `${VAR}` (resolved from the host environment at deploy
time); for Kubernetes it renders as a `secretKeyRef`. The CLI refuses to deploy if a
referenced variable isn't set.

See it in the rendered file without setting anything (dry-run skips the check):

```bash
kaupang up app --dry-run --cwd examples/secrets   # note API_TOKEN: ${API_TOKEN}
```

Deploy for real — the variable must be present:

```powershell
$env:API_TOKEN = "s3cr3t"
kaupang up app --cwd examples/secrets
kaupang down app --cwd examples/secrets
```
