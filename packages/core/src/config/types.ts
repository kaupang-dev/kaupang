export type BackendName = "compose" | "swarm" | "kubernetes";

/** Maps to Docker Compose pull_policy / Swarm --resolve-image. */
export type PullPolicy = "always" | "missing" | "never";

/** A value that should never be persisted — emitted as a runtime reference. */
export interface SecretRef {
  /** Name of the host/pipeline env var to read the value from at deploy time. */
  readonly $secret: string;
}

/** An env value: a literal string, or a `secret()` reference. */
export type EnvValue = string | SecretRef;

/** A map of env vars whose values may be literals or secret references. */
export type EnvMap = Record<string, EnvValue>;

export interface BuildConfig {
  context: string;
  dockerfile?: string;
  args?: Record<string, string>;
}

export interface HealthcheckConfig {
  /** e.g. "curl -f http://localhost/health" or ["CMD", "pg_isready"] */
  test: string | string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
}

/**
 * Normalized service — what backends consume. Authoring uses `ServiceInput`
 * (below), which the loader normalizes into this shape: image prefixed with the
 * docker repository, `dependsOn` coerced to an array, pull policy filled in.
 */
export interface ServiceDefinition {
  image?: string;
  build?: string | BuildConfig;
  command?: string | string[];
  entrypoint?: string | string[];
  workingDirectory?: string;
  capAdd?: string[];
  ports?: string[];
  env?: EnvMap;
  volumes?: string[];
  /** Other services in the same environment that must start first (normalized). */
  dependsOn?: string[];
  replicas?: number;
  restart?: "no" | "always" | "on-failure" | "unless-stopped";
  labels?: Record<string, string>;
  networks?: string[];
  healthcheck?: HealthcheckConfig;
  /** Pull behavior for this service's image. */
  pull?: PullPolicy;
  /**
   * A run-to-completion job (e.g. migrations / seed): it runs once and exits 0.
   * Implies `restart: "no"`, and dependents that list it in `dependsOn` wait for it
   * to finish successfully (compose `condition: service_completed_successfully`) so
   * `compose up --wait` doesn't treat its exit as a failure. (Compose backend; swarm
   * just won't restart it, and the minimal k8s backend ignores it.)
   */
  runOnce?: boolean;
}

/* ------------------------------------------------------------------ *
 * Authoring (input) types — the ergonomic surface you write by hand.  *
 * ------------------------------------------------------------------ */

/** "foo" | ["foo", "bar"] — coerced to an array during normalization. */
export type Dependable = string | string[];

/** A service spec as authored: like ServiceDefinition but `dependsOn` is loose. */
export interface ServiceSpec extends Omit<ServiceDefinition, "dependsOn"> {
  dependsOn?: Dependable;
}

/** Reference to a catalog preset, produced by `use(name, overrides?)`. */
export interface CatalogRef {
  $catalog: string;
  overrides?: Partial<ServiceSpec>;
}

/**
 * How you may declare a service:
 *  - a string  -> shorthand for `{ image: "<string>" }`
 *  - a spec    -> full object
 *  - use(name) -> a catalog preset
 */
export type ServiceInput = string | ServiceSpec | CatalogRef;

/** A hook command: a shell string, or an object with cwd/env. */
export type HookCommand =
  | string
  | { run: string; cwd?: string; env?: Record<string, string> };

export interface Hooks {
  beforeUp?: HookCommand[];
  afterUp?: HookCommand[];
  beforeDown?: HookCommand[];
  afterDown?: HookCommand[];
}

export interface EnvironmentDefinition {
  /** Unique name. Defaults to the file (or folder) name when omitted. */
  name?: string;
  /** Services that make up this environment (string / spec / catalog ref). */
  services: Record<string, ServiceInput>;
  /** Other environments that must be up first (string or array). */
  dependsOn?: Dependable;
  /** Environment-scoped variables (over globalEnv, under service env). */
  env?: EnvMap;
  /** Image prefix for services in this environment (overrides config.dockerRepository). */
  dockerRepository?: string;
  /** Default pull policy for this environment's services. */
  pull?: PullPolicy;
  /** Lifecycle hooks run around up/down. */
  hooks?: Hooks;
  networks?: string[];
  volumes?: string[];
}

/* ------------------------------------------------------------------ *
 * Catalog                                                             *
 * ------------------------------------------------------------------ */

export interface CatalogSourceConfig {
  /**
   * - "file": a JSON manifest on disk (`path`)
   * - "http": a JSON manifest over HTTP (`url`, optional `headers`)
   * - "oci":  an OCI artifact (`ref`, e.g. "ghcr.io/acme/kaupang-catalog:1") [planned]
   * - "service": a running catalog service kaupang queries (`url`) [planned]
   */
  type: "file" | "http" | "oci" | "service";
  path?: string;
  url?: string;
  ref?: string;
  headers?: Record<string, string>;
}

export interface CatalogConfig {
  sources: CatalogSourceConfig[];
}

/** A named place kaupang deploys to (a cluster, a remote host, or local). */
export interface TargetConfig {
  /** Default backend for this target (e.g. staging: swarm, prod: kubernetes). */
  backend?: BackendName;
  /** Default pull policy for this target. */
  pull?: PullPolicy;
  /** Env merged over globalEnv + environment env, under service env. */
  env?: EnvMap;
  /** docker context name → spawned as `docker --context <name> …` (compose/swarm). */
  dockerContext?: string;
  /** Explicit DOCKER_HOST (e.g. "ssh://deploy@host", "tcp://10.0.0.5:2375"). */
  dockerHost?: string;
  /** kube context name → spawned as `kubectl --context <name> …`. */
  kubeContext?: string;
  /** Path to a kubeconfig (relative to the config file); sets KUBECONFIG. */
  kubeconfig?: string;
}

/** A named, versioned composition of environments — what a pipeline bundles. */
export interface SolutionRecipe {
  /** Optional version label, recorded for reproducibility/audit. */
  version?: string;
  /** Top-level environments this solution deploys (their deps are pulled in). */
  environments: string[];
  /** Per-service image overrides, keyed by "environment.service". */
  pins?: Record<string, string>;
  /** Env overlay applied across the solution (above target env). */
  env?: EnvMap;
  /** Default target for this solution. */
  target?: string;
}

/** A wait condition for a pipeline `wait` step. */
export interface WaitSpec {
  /** Poll this URL until it returns `status` (default 200) or `timeout` elapses. */
  http?: string;
  status?: number;
  /** Poll interval, e.g. "2s". Default "2s". */
  interval?: string;
  /** Give up after this, e.g. "60s" / "2m". Default "60s". */
  timeout?: string;
  /** Or simply sleep this many seconds. */
  seconds?: number;
}

/** One node in a pipeline DAG. Exactly one action key must be set. */
export interface PipelineStep {
  /** Steps that must finish before this one. */
  needs?: Dependable;
  /** Run a shell command. */
  run?: HookCommand;
  /** Deploy an environment (like `kaupang up <env>`). */
  up?: string;
  /** Tear an environment down. */
  down?: string;
  /** Build images for an environment. */
  build?: string;
  /** Wait for a condition. */
  wait?: WaitSpec;
  /** Per-step target/backend overrides for up/down/build. */
  target?: string;
  backend?: BackendName;
}

export interface Pipeline {
  steps: Record<string, PipelineStep>;
}

export interface KaupangConfig {
  /** Folder (relative to the config file) holding one environment per file. */
  environments: string;
  /** Variables injected into every service of every environment (lowest priority). */
  globalEnv?: EnvMap;
  /** Backend used when `--backend` is not passed. Defaults to "compose". */
  defaultBackend?: BackendName;
  /** Cache directory. Defaults to ".kaupang". */
  cacheDir?: string;
  /** Project name used to namespace stacks / compose projects / k8s namespaces. */
  project?: string;
  /** Image prefix applied to bare image names (e.g. "ghcr.io/acme"). */
  dockerRepository?: string;
  /** Default pull policy for all services unless overridden. */
  defaultPull?: PullPolicy;
  /** Where to resolve catalog presets from. */
  catalog?: CatalogConfig;
  /** Named deployment targets (clusters / remote hosts). "local" is implicit. */
  targets?: Record<string, TargetConfig>;
  /** Inline solution recipes (also resolvable from the catalog). */
  solutions?: Record<string, SolutionRecipe>;
  /** Named pipelines: ordered run / up / down / build / wait steps. */
  pipelines?: Record<string, Pipeline>;
}
