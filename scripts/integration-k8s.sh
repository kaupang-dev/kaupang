#!/usr/bin/env bash
#
# Integration: the kubernetes backend against a real cluster (kind). Verifies
# `kaupang up --backend kubernetes` (kubectl apply of the rendered Namespace +
# Deployment + Service) rolls out and serves, and `down` deletes the namespace.
#
# Requires `kind`, `kubectl`, `docker`, and a built CLI.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIXTURE="test/integration/k8s"
CLUSTER="kaupang-itest"
NS="kaupang-k8s-web"
PF_PORT="18081"

step() { echo "==> $1"; }
pass() { echo "  ✔ $1"; }

PF_PID=""
cleanup() {
  step "cleanup"
  [ -n "$PF_PID" ] && kill "$PF_PID" >/dev/null 2>&1 || true
  node dist/cli.js down web --backend kubernetes --cwd "$FIXTURE" >/dev/null 2>&1 || true
  kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE/.kaupang"
}
trap cleanup EXIT

step "require kind + kubectl + a built CLI"
command -v kind >/dev/null 2>&1 || { echo "kind not on PATH — https://kind.sigs.k8s.io"; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl not on PATH"; exit 1; }
[ -f dist/cli.js ] || npm run build
pass "tools present"

step "create a kind cluster (kubectl context becomes kind-${CLUSTER})"
kind create cluster --name "$CLUSTER" --wait 120s
pass "cluster up"

step "kaupang up --backend kubernetes — kubectl apply of the rendered manifest"
node dist/cli.js up web --backend kubernetes --no-resolve --cwd "$FIXTURE"

step "assert the deployment rolls out"
kubectl rollout status deployment/web -n "$NS" --timeout=120s
pass "rolled out"

step "assert the service serves (via port-forward)"
kubectl -n "$NS" port-forward svc/web "${PF_PORT}:80" >/dev/null 2>&1 &
PF_PID=$!
ok=0
for i in $(seq 1 20); do
  if curl -fsS "http://localhost:${PF_PORT}/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
kill "$PF_PID" >/dev/null 2>&1 || true; PF_PID=""
[ "$ok" = "1" ] || { echo "service never served"; exit 1; }
pass "service ok"

step "kaupang down --backend kubernetes — delete the namespace"
node dist/cli.js down web --backend kubernetes --cwd "$FIXTURE"
pass "namespace deleted"

echo ""
echo "PASS — kubernetes integration green"
