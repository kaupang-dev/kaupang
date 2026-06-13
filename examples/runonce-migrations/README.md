# runonce-migrations

The migrations pattern: a one-shot `migrate` job runs to completion, and `web` only
starts once it has succeeded. Marking the job `runOnce: true` makes kaupang render
`depends_on` with `condition: service_completed_successfully`, so `compose up --wait`
waits for the job's clean exit instead of treating it as a crash.

```bash
kaupang up app --cwd examples/runonce-migrations    # migrate runs & exits, then web serves
kaupang down app --cwd examples/runonce-migrations
```

Inspect the generated `depends_on` / `restart` without running anything:

```bash
kaupang up app --dry-run --cwd examples/runonce-migrations
```
