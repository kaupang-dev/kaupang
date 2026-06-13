#!/usr/bin/env bash
#
# Integration: `kaupang build` (docker compose build) and `--push`. Verifies the CLI
# builds a service's local context into the tagged image, and pushes it to a registry.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY="localhost:5000"
IMAGE="${REGISTRY}/kaupang-built:v1"
NAME="kaupang-built"
FIXTURE="test/integration"
REG_NAME="kaupang-itest-registry"

step() { echo "==> $1"; }
pass() { echo "  ✔ $1"; }

cleanup() {
  step "cleanup"
  docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
  docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
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

# Make sure the image isn't lying around, so a successful inspect proves the build did it.
docker rmi -f "$IMAGE" >/dev/null 2>&1 || true

step "kaupang build — docker compose build of the local ./app context"
node dist/cli.js build built --cwd "$FIXTURE"
docker image inspect "$IMAGE" >/dev/null
pass "image built: ${IMAGE}"

step "kaupang build --push — build then push to the registry"
node dist/cli.js build built --push --cwd "$FIXTURE"
curl -fsS --max-time 5 "http://${REGISTRY}/v2/${NAME}/tags/list" | grep -q '"v1"'
pass "image present in registry"

echo ""
echo "PASS — build integration green"
