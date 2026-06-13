import { setVerbose } from "../util/exec.js";

/** The shared `--verbose` / `-v` flag — spread into a command's `args`. */
export const verboseArg = {
  verbose: {
    type: "boolean" as const,
    alias: "v",
    description: "Print each underlying command ($ docker …) as it runs.",
  },
};

/** Apply the parsed `--verbose` flag to the global command-echo setting. */
export function applyVerbose(args: { verbose?: boolean }): void {
  setVerbose(Boolean(args.verbose));
}
