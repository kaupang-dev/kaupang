# kubernetes

The Kubernetes backend. The same kind of definitions you'd deploy to Compose render
instead as a Namespace + a Deployment (+ a Service for ported services) per service.
This backend is intentionally minimal — no Ingress / PVC / ConfigMap / HPA / CRD.

See the generated manifest without a cluster:

```bash
kaupang up app --dry-run --cwd examples/kubernetes
```

To apply for real you need a cluster (e.g. `kind` or `minikube`) on your current
kube-context, and the referenced secret created in the namespace first:

```bash
kubectl create namespace k8s-demo-app
kubectl -n k8s-demo-app create secret generic k8s-demo-secrets --from-literal=API_TOKEN=s3cr3t
kaupang up app --cwd examples/kubernetes
kaupang down app --cwd examples/kubernetes
```
