#!/usr/bin/env node
/**
 * Verificador documental — backend (agendai-back-end)
 * Sem dependências novas. Modo checagem: exit 1 se falhar.
 *
 * Uso: node scripts/check-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const entryFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  "docs/agents/PACKAGES.md",
  "docs/agents/SCRIPTS.md",
  "docs/agents/STRUCTURE.md",
  "docs/agents/DOMAIN_MAP.md",
  "docs/agents/BUSINESS_RULES.md",
  "docs/agents/ARCHITECTURE.md",
  "docs/agents/GRAPHIFY.md",
];

for (const f of entryFiles) {
  if (!exists(f)) errors.push(`Arquivo obrigatório ausente: ${f}`);
}

const pkg = JSON.parse(read("package.json"));
const packagesMd = exists("docs/agents/PACKAGES.md") ? read("docs/agents/PACKAGES.md") : "";
const scriptsMd = exists("docs/agents/SCRIPTS.md") ? read("docs/agents/SCRIPTS.md") : "";

for (const section of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(pkg[section] || {})) {
    if (!packagesMd.includes(`\`${name}\``)) {
      errors.push(`Pacote não catalogado em PACKAGES.md: ${name}`);
    }
  }
}

for (const name of Object.keys(pkg.scripts || {})) {
  if (!scriptsMd.includes(`\`${name}\``)) {
    errors.push(`Script não catalogado em SCRIPTS.md: ${name}`);
  }
}

const agents = exists("AGENTS.md") ? read("AGENTS.md") : "";
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
let m;
while ((m = linkRe.exec(agents)) !== null) {
  let target = m[1].split("#")[0];
  if (!target || target.startsWith("http")) continue;
  if (target.startsWith("./")) target = target.slice(2);
  if (!exists(target)) errors.push(`Link quebrado em AGENTS.md: ${m[1]}`);
}

const modulesDir = path.join(root, "src", "modules");
if (fs.existsSync(modulesDir)) {
  const structure = exists("docs/agents/STRUCTURE.md") ? read("docs/agents/STRUCTURE.md") : "";
  const onDisk = fs
    .readdirSync(modulesDir)
    .filter((name) => fs.statSync(path.join(modulesDir, name)).isDirectory())
    .sort();
  for (const name of onDisk) {
    if (!structure.includes(`\`${name}\``)) {
      errors.push(`Módulo em disco não listado em STRUCTURE.md: ${name}`);
    }
  }
}

if (errors.length) {
  console.error("docs:check FAILED\n");
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log("docs:check OK (backend)");
