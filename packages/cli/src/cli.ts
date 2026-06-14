#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { buildCommand } from "./commands/build.js";
import { bundleCommand } from "./commands/bundle.js";
import { downCommand } from "./commands/down.js";
import { rollbackCommand } from "./commands/rollback.js";
import { runCommand } from "./commands/run.js";
import { studioCommand } from "./commands/studio.js";
import { upCommand } from "./commands/up.js";

const main = defineCommand({
  meta: {
    name: "kaupang",
    version: "0.1.0",
    description:
      "The trading hub for your deploys — gather your services, pin them into portable cargo, and ship them to any target (Compose, Swarm, or Kubernetes) from one config.",
  },
  subCommands: {
    up: upCommand,
    down: downCommand,
    build: buildCommand,
    bundle: bundleCommand,
    rollback: rollbackCommand,
    run: runCommand,
    studio: studioCommand,
  },
});

runMain(main);
