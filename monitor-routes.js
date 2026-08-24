#!/usr/bin/env node
/**
 * monitor-routes.js
 * Monitor de rotas da API AgendAI em tempo real
 * Compatível com Linux, macOS e Windows
 *
 * Uso:
 *   node monitor-routes.js
 *   node monitor-routes.js --url http://localhost:3333
 *   node monitor-routes.js --url http://localhost:3333 --interval 5
 *   node monitor-routes.js --url http://localhost:3333 --token SEU_JWT
 */

const http  = require("http");
const https = require("https");
const url   = require("url");

// ─── Configuração via args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const BASE_URL = getArg("--url")      || "http://localhost:3333/api";
const INTERVAL = parseInt(getArg("--interval") || "10") * 1000;
const TOKEN    = getArg("--token")    || "";

// ─── Cores (cross-platform: funciona no terminal moderno de todos OS) ─────────
const isWindows = process.platform === "win32";
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
  bgGreen:  "\x1b[42m",
  bgRed:    "\x1b[41m",
  bgYellow: "\x1b[43m",
};

// ─── Todas as rotas da API ────────────────────────────────────────────────────
const ROUTES = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  { group: "Auth",         method: "POST",  path: "/auth/login",          auth: false, body: { email: "admin@agendai.local", password: "admin123" } },
  { group: "Auth",         method: "POST",  path: "/auth/refresh",        auth: false, body: { refreshToken: "test" } },
  { group: "Auth",         method: "GET",   path: "/auth/me",             auth: true  },

  // ── Health ────────────────────────────────────────────────────────────────
  { group: "Health",       method: "GET",   path: "/health",              auth: false, baseOverride: BASE_URL.replace("/api", "") },

  // ── Users ─────────────────────────────────────────────────────────────────
  { group: "Users",        method: "POST",  path: "/users",               auth: false, body: {} },

  // ── Barbershops ───────────────────────────────────────────────────────────
  { group: "Barbershops",  method: "GET",   path: "/barbershops",         auth: false },
  { group: "Barbershops",  method: "POST",  path: "/barbershops",         auth: true,  body: {} },
  { group: "Barbershops",  method: "GET",   path: "/barbershops/test-id", auth: false },

  // ── Services ──────────────────────────────────────────────────────────────
  { group: "Services",     method: "GET",   path: "/services",            auth: false },
  { group: "Services",     method: "POST",  path: "/services",            auth: true,  body: {} },

  // ── Queue ─────────────────────────────────────────────────────────────────
  { group: "Queue",        method: "GET",   path: "/queue",               auth: true  },
  { group: "Queue",        method: "POST",  path: "/queue",               auth: false, body: {} },
  { group: "Queue",        method: "GET",   path: "/queue/metrics",       auth: false },

  // ── Payments ──────────────────────────────────────────────────────────────
  { group: "Payments",     method: "GET",   path: "/payments",            auth: true  },
  { group: "Payments",     method: "POST",  path: "/payments/card",       auth: true,  body: {} },
  { group: "Payments",     method: "POST",  path: "/payments/pix",        auth: true,  body: {} },
  { group: "Payments",     method: "POST",  path: "/payments/webhook",    auth: false, body: {} },

  // ── Plans ─────────────────────────────────────────────────────────────────
  { group: "Plans",        method: "GET",   path: "/plans",               auth: false },
  { group: "Plans",        method: "GET",   path: "/plans/test-id",       auth: false },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  { group: "Subscriptions", method: "POST", path: "/subscriptions",       auth: true,  body: {} },
  { group: "Subscriptions", method: "GET",  path: "/subscriptions/me",    auth: true  },

  // ── Fiado ─────────────────────────────────────────────────────────────────
  { group: "Fiado",        method: "GET",   path: "/fiado",               auth: true  },
  { group: "Fiado",        method: "POST",  path: "/fiado",               auth: true,  body: {} },
  { group: "Fiado",        method: "GET",   path: "/fiado/summary",       auth: true  },

  // ── Expenses ──────────────────────────────────────────────────────────────
  { group: "Expenses",     method: "GET",   path: "/expenses",            auth: true  },
  { group: "Expenses",     method: "POST",  path: "/expenses",            auth: true,  body: {} },
  { group: "Expenses",     method: "GET",   path: "/expenses/summary",    auth: true  },

  // ── Barbershop Financial ──────────────────────────────────────────────────
  { group: "Barb.Financial", method: "GET", path: "/barbershop/financial/summary",  auth: true },
  { group: "Barb.Financial", method: "GET", path: "/barbershop/financial/expenses", auth: true },
  { group: "Barb.Financial", method: "GET", path: "/barbershop/financial/fiados",   auth: true },

  // ── Admin ─────────────────────────────────────────────────────────────────
  { group: "Admin",        method: "GET",   path: "/admin/dashboard",     auth: true  },
  { group: "Admin",        method: "GET",   path: "/admin/barbershops",   auth: true  },
  { group: "Admin",        method: "GET",   path: "/admin/users",         auth: true  },
  { group: "Admin",        method: "GET",   path: "/admin/audit-logs",    auth: true  },
  { group: "Admin",        method: "GET",   path: "/admin/notifications", auth: true  },
  { group: "Admin",        method: "GET",   path: "/admin/notifications/unread-count", auth: true },
  { group: "Admin",        method: "GET",   path: "/admin/blocked-entities", auth: true },
  { group: "Admin",        method: "GET",   path: "/admin/subscriptions", auth: true  },

  // ── Admin Financial ───────────────────────────────────────────────────────
  { group: "Admin.Financial", method: "GET", path: "/admin/financial/overview",     auth: true },
  { group: "Admin.Financial", method: "GET", path: "/admin/financial/summary",      auth: true },
  { group: "Admin.Financial", method: "GET", path: "/admin/financial/barbershops",  auth: true },

  // ── Plans admin ───────────────────────────────────────────────────────────
  { group: "Admin.Plans", method: "POST",   path: "/admin/plans",        auth: true, body: {} },
];

// ─── HTTP request helper ──────────────────────────────────────────────────────
function request(method, fullUrl, headers, body) {
  return new Promise((resolve) => {
    const start = Date.now();
    const parsed = url.parse(fullUrl);
    const lib = parsed.protocol === "https:" ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        ...headers,
      },
      timeout: 8000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, ms: Date.now() - start, ok: true });
      });
    });

    req.on("error", () => resolve({ status: 0, ms: Date.now() - start, ok: false, err: "connection refused" }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, ms: Date.now() - start, ok: false, err: "timeout" }); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Lógica de status ─────────────────────────────────────────────────────────
// Uma rota está "UP" se o servidor responde (qualquer status HTTP).
// Status 0 = servidor não responde = DOWN.
// 401/403 em rota auth: significa que a rota existe (UP), só precisa de token válido.
// 400/422 em rota com body vazio: rota existe mas rejeitou dados inválidos (UP).
function classify(status, auth) {
  if (status === 0)   return "DOWN";
  if (status === 404) return "NOT_FOUND";
  if (status === 401 || status === 403) return auth ? "UP_NOAUTH" : "UP";
  if (status >= 200 && status < 500) return "UP";
  if (status >= 500) return "ERROR";
  return "UP";
}

function statusColor(state) {
  switch (state) {
    case "UP":        return C.green;
    case "UP_NOAUTH": return C.green;
    case "NOT_FOUND": return C.red;
    case "DOWN":      return C.red;
    case "ERROR":     return C.yellow;
    default:          return C.gray;
  }
}

function statusLabel(state, status) {
  switch (state) {
    case "UP":        return `${C.bgGreen}${C.bold}  OK  ${C.reset}`;
    case "UP_NOAUTH": return `${C.bgGreen}${C.bold}  OK  ${C.reset}`;
    case "NOT_FOUND": return `${C.bgRed}${C.bold} 404  ${C.reset}`;
    case "DOWN":      return `${C.bgRed}${C.bold} DOWN ${C.reset}`;
    case "ERROR":     return `${C.bgYellow}${C.bold} ERR  ${C.reset}`;
    default:          return `${C.gray} ??? ${C.reset}`;
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function clearScreen() {
  process.stdout.write(isWindows ? "\x1Bc" : "\x1b[2J\x1b[H");
}

function pad(str, len) {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, "");
  return str + " ".repeat(Math.max(0, len - clean.length));
}

function render(results, iteration, startTime, lastError) {
  clearScreen();

  const now = new Date().toLocaleTimeString();
  const up   = results.filter(r => r.state === "UP" || r.state === "UP_NOAUTH").length;
  const down = results.filter(r => r.state === "DOWN" || r.state === "NOT_FOUND").length;
  const err  = results.filter(r => r.state === "ERROR").length;
  const total = results.length;

  // Header
  console.log(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║           AgendAI — Monitor de Rotas em Tempo Real           ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  ${C.gray}Base URL:${C.reset} ${C.white}${BASE_URL}${C.reset}   ${C.gray}Atualização: ${now}  #${iteration}${C.reset}`);
  console.log(`  ${C.green}▲ UP: ${up}/${total}${C.reset}   ${C.red}▼ DOWN/404: ${down}${C.reset}   ${C.yellow}⚠ ERROR: ${err}${C.reset}   ${C.gray}Intervalo: ${INTERVAL/1000}s${C.reset}`);
  if (!TOKEN) console.log(`  ${C.yellow}⚠  Sem token — rotas autenticadas mostrarão UP (401 = rota existe)${C.reset}`);
  console.log();

  // Agrupa por group
  const groups = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }

  for (const [group, items] of Object.entries(groups)) {
    const groupUp = items.every(r => r.state === "UP" || r.state === "UP_NOAUTH");
    const groupDot = groupUp ? `${C.green}●${C.reset}` : `${C.red}●${C.reset}`;
    console.log(`  ${groupDot} ${C.bold}${group}${C.reset}`);

    for (const r of items) {
      const badge  = statusLabel(r.state, r.status);
      const method = pad(`${C.cyan}${r.method}${C.reset}`, 10);
      const path   = pad(r.path, 44);
      const code   = r.status > 0 ? `${statusColor(r.state)}${r.status}${C.reset}` : `${C.red}---${C.reset}`;
      const ms     = r.ms > 0 ? `${C.gray}${r.ms}ms${C.reset}` : `${C.gray}   -${C.reset}`;
      const auth   = r.auth ? `${C.gray}🔒${C.reset}` : "  ";
      console.log(`    ${badge} ${method} ${path} ${code}  ${pad(ms, 8)} ${auth}`);
    }
    console.log();
  }

  // Legenda
  console.log(`  ${C.gray}──────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.gray}${C.bgGreen}${C.bold}  OK  ${C.reset}${C.gray} = rota responde (2xx/3xx/4xx)   ${C.red}▼ DOWN${C.reset}${C.gray} = sem resposta / 404${C.reset}`);
  console.log(`  ${C.gray}🔒 = rota autenticada   Próxima atualização em ${INTERVAL/1000}s  (Ctrl+C para sair)${C.reset}`);

  if (lastError) {
    console.log(`\n  ${C.yellow}⚠ Último erro: ${lastError}${C.reset}`);
  }
}

// ─── Loop principal ───────────────────────────────────────────────────────────
let iteration = 0;
let lastError = null;
const startTime = Date.now();

async function runCheck() {
  iteration++;
  const results = [];

  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

  for (const route of ROUTES) {
    const base = route.baseOverride || BASE_URL;
    const fullUrl = base + route.path;
    try {
      const res = await request(route.method, fullUrl, headers, route.body || null);
      results.push({
        ...route,
        status: res.status,
        ms: res.ms,
        state: classify(res.status, route.auth),
      });
    } catch (e) {
      lastError = e.message;
      results.push({ ...route, status: 0, ms: 0, state: "DOWN" });
    }
  }

  render(results, iteration, startTime, lastError);
}

// Primeira execução imediata + intervalo
console.log(`${C.cyan}Iniciando monitor... conectando em ${BASE_URL}${C.reset}`);
runCheck().then(() => {
  setInterval(runCheck, INTERVAL);
});

process.on("SIGINT", () => {
  console.log(`\n${C.cyan}Monitor encerrado.${C.reset}\n`);
  process.exit(0);
});
