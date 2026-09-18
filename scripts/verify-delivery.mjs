#!/usr/bin/env node
/**
 * Gate local de entrega (sem produção).
 * Uso: npm run verify:delivery
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["docs:check", ["run", "docs:check"]],
  ["typecheck", ["run", "typecheck"]],
  ["test:unit", ["run", "test:unit"]],
  ["test:security", ["run", "test:security"]],
];

for (const [label, args] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync("npm", args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`verify:delivery FAILED at ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nverify:delivery OK (backend)");
