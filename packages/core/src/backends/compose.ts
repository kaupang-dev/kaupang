import { join } from "node:path";
import { renderComposeFile } from "./compose-spec.js";
import { stackName } from "../util/names.js";
import type { PullPolicy } from "../config/types.js";
import type { EnvironmentPlan } from "../graph/resolver.js";
import type { Backend, BackendContext, MaterializedEnvironment } from "./types.js";

function composeFilePath(env: EnvironmentPlan, ctx: BackendContext): string {
  return join(ctx.cacheDir, stackName(ctx.project, env.name), "docker-compose.yml");
}

/** Map kaupang pull policy to `docker stack deploy --resolve-image`. */
function resolveImageFlag(pull: PullPolicy): string {
  if (pull === "missing") return "changed";
  return pull; // "always" | "never"
}

export const composeBackend: Backend = {
  name: "compose",
  materialize(env, ctx): MaterializedEnvironment {
    const file = composeFilePath(env, ctx);
    const project = stackName(ctx.project, env.name);
    const content = renderComposeFile(env, { swarm: false, baseEnv: ctx.baseEnv, targetEnv: ctx.targetEnv });

    // The compose file lives under the cache dir, but relative paths in it (build
    // contexts, bind mounts) are authored relative to the repo root. Point compose
    // at the root via --project-directory so those resolve where the user expects.
    const base = ["compose", "-p", project, "--project-directory", ctx.rootDir, "-f", file];

    const upArgs = [...base, "up", "-d", "--wait"];
    if (ctx.pull) upArgs.push("--pull", ctx.pull);

    return {
      files: [{ path: file, content }],
      up: [{ description: `compose up ${env.name}`, file: "docker", args: upArgs }],
      down: [
        {
          description: `compose down ${env.name}`,
          file: "docker",
          args: [...base, "down"],
        },
      ],
      build: [
        {
          description: `compose build ${env.name}`,
          file: "docker",
          args: [...base, "build"],
        },
      ],
      push: [
        {
          description: `compose push ${env.name}`,
          file: "docker",
          args: [...base, "push"],
        },
      ],
    };
  },
};

export const swarmBackend: Backend = {
  name: "swarm",
  materialize(env, ctx): MaterializedEnvironment {
    const file = composeFilePath(env, ctx);
    const stack = stackName(ctx.project, env.name);
    const content = renderComposeFile(env, { swarm: true, baseEnv: ctx.baseEnv, targetEnv: ctx.targetEnv });

    const deployArgs = ["stack", "deploy", "--detach=false", "-c", file, stack];
    if (ctx.pull) deployArgs.splice(2, 0, `--resolve-image=${resolveImageFlag(ctx.pull)}`);

    return {
      files: [{ path: file, content }],
      up: [{ description: `stack deploy ${stack}`, file: "docker", args: deployArgs }],
      down: [
        {
          description: `stack rm ${stack}`,
          file: "docker",
          args: ["stack", "rm", stack],
        },
      ],
      // Swarm has no build step; build + push out of band (or via `kaupang build`
      // on the compose backend, then deploy the pushed image).
      build: [],
    };
  },
};
