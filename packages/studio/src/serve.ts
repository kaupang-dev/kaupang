#!/usr/bin/env node
// Standalone entry — used by the Docker image and the `kaupang-studio` bin.
// Configured via env vars so it needs no arguments in a container.
import { startStudio } from "./server.js";

const { url } = await startStudio({
  port: process.env.PORT ? Number(process.env.PORT) : 8080,
  host: process.env.HOST ?? "0.0.0.0",
  catalog: process.env.KAUPANG_CATALOG,
  rootDir: process.env.KAUPANG_CWD,
  open: false,
});

// eslint-disable-next-line no-console
console.log(`kaupang studio listening on ${url}`);
