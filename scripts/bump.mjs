#!/usr/bin/env node
// Lockstep version bump for the monorepo. Sets every packages/* package.json (and the
// root) to one version, rewrites the inter-package dependency ranges to ^<version>,
// and syncs the lockfile.
//
//   npm run bump -- 0.2.0        # explicit
//   npm run bump -- minor        # or patch / major (computed from the root version)
//   npm run bump -- 0.2.0 --dry  # print the plan, change nothing
//
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const dry = args.includes("--dry") || args.includes("--dry-run");
const spec = args.find((a) => !a.startsWith("-"));
if (!spec) {
  console.error("usage: npm run bump -- <version|patch|minor|major> [--dry]");
  process.exit(1);
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, json) => writeFileSync(p, JSON.stringify(json, null, 2) + "\n");

const rootPkg = read("package.json");
const cur = rootPkg.version;

function nextVersion(current, s) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(s)) return s; // explicit
  const [a, b, c] = current.split("-")[0].split(".").map(Number);
  if (s === "major") return `${a + 1}.0.0`;
  if (s === "minor") return `${a}.${b + 1}.0`;
  if (s === "patch") return `${a}.${b}.${c + 1}`;
  throw new Error(`invalid version or bump keyword: "${s}"`);
}
const version = nextVersion(cur, spec);

const pkgs = readdirSync("packages", { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`packages/${d.name}/package.json`))
  .map((d) => ({ path: `packages/${d.name}/package.json`, json: read(`packages/${d.name}/package.json`) }));

const workspaceNames = new Set(pkgs.map((p) => p.json.name));

const bumpWorkspaceDeps = (deps) => {
  const changed = [];
  for (const name of Object.keys(deps ?? {})) {
    if (workspaceNames.has(name)) {
      deps[name] = `^${version}`;
      changed.push(name);
    }
  }
  return changed;
};

console.log(`bump ${cur} → ${version}${dry ? "   (dry run)" : ""}\n`);
for (const { path, json } of pkgs) {
  json.version = version;
  const changed = [
    ...bumpWorkspaceDeps(json.dependencies),
    ...bumpWorkspaceDeps(json.devDependencies),
    ...bumpWorkspaceDeps(json.peerDependencies),
  ];
  console.log(`  ${json.name.padEnd(18)} ${version}${changed.length ? `   deps → ^${version}: ${changed.join(", ")}` : ""}`);
  if (!dry) write(path, json);
}
rootPkg.version = version;
console.log(`  ${"(root)".padEnd(18)} ${version}`);
if (!dry) write("package.json", rootPkg);

if (dry) {
  console.log("\ndry run — nothing written.");
  process.exit(0);
}

console.log("\nsyncing lockfile…");
execSync("npm install --package-lock-only", { stdio: "inherit" });
console.log(`\n✓ bumped to ${version}. Next: move CHANGELOG [Unreleased] → [${version}], commit, then:`);
console.log(`    git tag v${version} && git push --tags`);
