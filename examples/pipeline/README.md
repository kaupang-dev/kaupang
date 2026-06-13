# pipeline

An ordered, DAG-based release recipe: a `run` step, an `up` step, an HTTP `wait`, and
a final `run`. `needs` declares dependencies; kaupang topo-sorts the steps and reports
which could run in parallel.

```bash
kaupang run deploy --dry-run --cwd examples/pipeline    # print the step graph
kaupang run deploy --cwd examples/pipeline              # run it (brings web up, smoke-tests it)
```

Tear the deployed environment down afterwards:

```bash
kaupang down web --cwd examples/pipeline
```
