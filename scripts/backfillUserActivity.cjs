#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const sourceEntry = join(root, "src", "scripts", "backfillUserActivity.ts");
const distEntry = join(root, "dist", "scripts", "backfillUserActivity.js");

if (existsSync(sourceEntry)) {
  // Checkout de desenvolvimento: executa o TypeScript sem exigir build.
  const result = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), sourceEntry, ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  // Imagem de produção: a imagem final contém apenas dist/ e este launcher.
  if (!existsSync(distEntry)) {
    throw new Error(
      `Backfill compilado não encontrado: ${distEntry}. Execute npm run build antes do job.`,
    );
  }
  require(distEntry);
}
