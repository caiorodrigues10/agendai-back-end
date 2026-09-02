#!/usr/bin/env node
/* Monitor comportamental do AgendAI. Não cria cobranças nem altera dados. */
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = String(arg('--url', 'http://localhost:3333')).replace(/\/$/, '');
const token = arg('--token', '');
const shopId = arg('--shop-id', '');
const serviceId = arg('--service-id', '');
const once = args.includes('--once');
const interval = Number(arg('--interval', '60')) * 1000;

async function probe(name, path, expected, validate = () => true, authenticated = false) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}${path}`, {
      headers: {
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Correlation-Id': `monitor-${Date.now()}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    const correlation = response.headers.get('x-correlation-id');
    const ok = expected.includes(response.status) && validate(body) && Boolean(correlation);
    return { name, ok, status: response.status, ms: Date.now() - started, correlation: Boolean(correlation) };
  } catch (error) {
    return { name, ok: false, status: 0, ms: Date.now() - started, error: error instanceof Error ? error.message : 'network error' };
  }
}

async function run() {
  const checks = [
    probe('health', '/health', [200], body => body?.status === 'ok' && body?.checks?.db === 'healthy' && body?.checks?.redis === 'healthy'),
    probe('ready', '/ready', [200], body => body?.status === 'ready'),
    probe('plans', '/api/plans', [200], body => body?.success === true && Array.isArray(body?.data)),
    probe('public shops', '/api/barbershops', [200], body => body?.success === true && Array.isArray(body?.data)),
    probe('auth guard', '/api/subscriptions/me', token ? [200, 402, 403] : [401], body => body?.success !== undefined, true),
  ];
  if (shopId && serviceId) {
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    checks.push(probe('public availability', `/api/appointments/availability?barbershopId=${encodeURIComponent(shopId)}&serviceId=${encodeURIComponent(serviceId)}&date=${date}`, [200], body => body?.success === true && Array.isArray(body?.data)));
  }
  const results = await Promise.all(checks);
  console.table(results);
  if (results.some(result => !result.ok)) process.exitCode = 1;
}

void run();
if (!once) setInterval(() => void run(), interval);
