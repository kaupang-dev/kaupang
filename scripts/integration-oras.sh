#!/usr/bin/env bash
#
# Integration: OCI / oras paths against a local registry. Two flows, both of which
# need kaupang's `--plain-http` handling for insecure registries (util/registry.ts):
#
#   1. bundle-over-OCI:  kaupang bundle --push oci://… (oras push) then
#                        kaupang up --bundle oci://…   (oras pull + deploy)
#   2. OCI catalog:      oras push a catalog.json, then resolve a preset from a
#                        { type: "oci" } catalog source.
#
# Requires `docker` and `oras` on PATH, and a built CLI.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY="localhost:5000"
IMAGE="${REGISTRY}/kaupang-itest:v1"
BUNDLE_REF="oci://${REGISTRY}/bundles/itest:1"
CATALOG_REF="${REGISTRY}/itest-catalog:1"
FIXTURE="test/integration"
OCI_CAT="test/integration/oci-catalog"
REG_NAME="kaupang-itest-registry"
PROJECT="kaupang-itest_app"
HEALTH_URL="http://localhost:18080/health"
BUNDLE_OUT="itest-bundle"

step() { echo "==> $1"; }
pass() { echo "  ✔ $1"; }

cleanup() {
  step "cleanup"
  node dist/cli.js down app --cwd "$FIXTURE" >/dev/null 2>&1 || true
  docker compose -p "$PROJECT" down >/dev/null 2>&1 || true
  docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
  rm -rf "$FIXTURE/.kaupang" "$FIXTURE/$BUNDLE_OUT" "$OCI_CAT/.kaupang"
}
trap cleanup EXIT

step "require oras + a built CLI"
command -v oras >/dev/null 2>&1 || { echo "oras not on PATH — install from https://oras.land"; exit 1; }
[ -f dist/cli.js ] || npm run build
pass "oras present"

step "start registry + build/push the app image"
docker rm -f "$REG_NAME" >/dev/null 2>&1 || true
docker run -d --name "$REG_NAME" -p 5000:5000 registry:2 >/dev/null
for i in $(seq 1 30); do
  if curl -fsS "http://${REGISTRY}/v2/" >/dev/null 2>&1; then break; fi
  [ "$i" -eq 30 ] && { echo "registry never came up"; exit 1; }
  sleep 1
done
docker build -t "$IMAGE" "$FIXTURE/app"
docker push "$IMAGE" >/dev/null
pass "registry up, image pushed"

# ---------------------------------------------------------------- bundle over OCI
step "kaupang bundle --push — pack + oras-push the bundle"
node dist/cli.js bundle itest --push "$BUNDLE_REF" --output "$BUNDLE_OUT" --cwd "$FIXTURE"
pass "bundle pushed to ${BUNDLE_REF}"

step "kaupang up --bundle — oras-pull + deploy the pinned artifact"
node dist/cli.js up --bundle "$BUNDLE_REF" --cwd "$FIXTURE"

step "assert /health after the bundle round-trip"
for i in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then break; fi
  [ "$i" -eq 20 ] && { echo "health never passed"; exit 1; }
  sleep 1
done
pass "bundle round-trip health ok"

node dist/cli.js down app --cwd "$FIXTURE" >/dev/null
pass "bundle deploy torn down"

# ------------------------------------------------------------- OCI catalog source
step "oras-push a catalog.json as an OCI artifact"
CATDIR="$(mktemp -d)"
cat > "$CATDIR/catalog.json" <<'JSON'
{ "services": { "demo": { "image": "nginx:alpine", "ports": ["80"] } } }
JSON
( cd "$CATDIR" && oras push --plain-http "$CATALOG_REF" catalog.json >/dev/null )
rm -rf "$CATDIR"
pass "catalog pushed to ${CATALOG_REF}"

step "kaupang resolves a preset from the OCI catalog (dry-run)"
node dist/cli.js up data --dry-run --output json --cwd "$OCI_CAT" | grep -q "nginx:alpine"
pass "OCI catalog source resolved the preset"

echo ""
echo "PASS — oras integration green"
