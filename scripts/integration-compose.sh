#!/usr/bin/env bash
#
# End-to-end compose integration against a real Docker daemon + a throwaway local
# registry. Exercises the live paths the offline unit suite cannot:
#
#   build → push → digest resolution (docker buildx imagetools inspect)
#        → pinned compose deploy (up --wait) → /health → ledger record → down
#
# Runs identically on a laptop and in CI — that's the whole point. Requires
# `docker` (with buildx) and a built CLI (`npm run build`).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY="localhost:5000"
IMAGE="${REGISTRY}/kaupang-itest:v1"
FIXTURE="test/integration"
REG_NAME="kaupang-itest-registry"
HEALTH_URL="http://localhost:18080/health"

step() { echo "==> $1"; }
pass() { echo "  ✔ $1"; }

cleanup() {
  step "cleanup"
  node dist/cli.js down app --cwd "$FIXTURE" >/dev/null 2>&1 || true
  docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE/.kaupang"
}
trap cleanup EXIT

step "ensure the CLI is built"
[ -f dist/cli.js ] || npm run build

step "start a throwaway registry at ${REGISTRY}"
docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
docker run -d --name "$REG_NAME" -p 5000:5000 registry:2 >/dev/null
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://${REGISTRY}/v2/" >/dev/null 2>&1; then break; fi
  [ "$i" -eq 30 ] && { echo "registry never came up"; exit 1; }
  sleep 1
done
pass "registry up"

# The daemon (and buildx imagetools, which kaupang uses to resolve digests) treat
# localhost registries as insecure HTTP automatically — no extra builder needed.
step "build + push the test image"
docker build -t "$IMAGE" "$FIXTURE/app"
docker push "$IMAGE"
pass "pushed ${IMAGE}"

step "kaupang up — resolves the digest and deploys the pinned image via compose"
node dist/cli.js up app --cwd "$FIXTURE"

step "assert the service answers /health"
for i in $(seq 1 20); do
  if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  [ "$i" -eq 20 ] && { echo "health check never passed"; exit 1; }
  sleep 1
done
pass "health ok"

step "assert a sha256 digest was resolved + recorded in the ledger"
grep -q 'sha256:' "$FIXTURE/.kaupang/ledger.json"
pass "digest pinned in ledger"

step "kaupang down"
node dist/cli.js down app --cwd "$FIXTURE"
pass "torn down"

echo ""
echo "PASS — compose integration green"
