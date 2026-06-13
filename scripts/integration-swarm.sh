#!/usr/bin/env bash
#
# Integration: the swarm backend. Verifies `kaupang up --backend swarm` (docker stack
# deploy) brings a service to 1/1 and serves through the routing mesh, and that
# `kaupang down --backend swarm` (docker stack rm) tears it down. Single-node swarm.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY="localhost:5000"
IMAGE="${REGISTRY}/kaupang-itest:v1"
FIXTURE="test/integration"
REG_NAME="kaupang-itest-registry"
STACK="kaupang-itest_app"          # stackName(project, env)
HEALTH_URL="http://localhost:18080/health"
INIT_SWARM=0                        # did we init the swarm? (so we leave it on exit)

step() { echo "==> $1"; }
pass() { echo "  ✔ $1"; }

cleanup() {
  step "cleanup"
  node dist/cli.js down app --backend swarm --cwd "$FIXTURE" >/dev/null 2>&1 || true
  if [ "$INIT_SWARM" = "1" ]; then docker swarm leave --force >/dev/null 2>&1 || true; fi
  docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE/.kaupang"
}
trap cleanup EXIT

step "ensure the CLI is built"
[ -f dist/cli.js ] || npm run build

step "ensure a single-node swarm is active"
if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != "active" ]; then
  docker swarm init >/dev/null
  INIT_SWARM=1
fi
pass "swarm active"

step "start registry + build + push the image"
docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
docker run -d --name "$REG_NAME" -p 5000:5000 registry:2 >/dev/null
for i in $(seq 1 30); do
  if curl -fsS "http://${REGISTRY}/v2/" >/dev/null 2>&1; then break; fi
  [ "$i" -eq 30 ] && { echo "registry never came up"; exit 1; }
  sleep 1
done
docker build -t "$IMAGE" "$FIXTURE/app"
docker push "$IMAGE"
pass "pushed ${IMAGE}"

step "kaupang up --backend swarm — docker stack deploy"
node dist/cli.js up app --backend swarm --cwd "$FIXTURE"

step "assert the stack service converges to 1/1"
for i in $(seq 1 30); do
  reps="$(docker stack services "$STACK" --format '{{.Replicas}}' 2>/dev/null | head -1)"
  [ "$reps" = "1/1" ] && break
  if [ "$i" -eq 30 ]; then
    echo "service never converged (last: '$reps')"
    docker stack ps "$STACK" --no-trunc || true
    exit 1
  fi
  sleep 2
done
pass "service 1/1"

step "assert /health through the routing mesh"
for i in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  [ "$i" -eq 20 ] && { echo "health never passed"; exit 1; }
  sleep 2
done
pass "health ok"

step "kaupang down --backend swarm — docker stack rm"
node dist/cli.js down app --backend swarm --cwd "$FIXTURE"

echo ""
echo "PASS — swarm integration green"
