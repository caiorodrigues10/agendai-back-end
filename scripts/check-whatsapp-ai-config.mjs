#!/usr/bin/env node
/**
 * Verifica se o ambiente está pronto para o atendente de IA no WhatsApp.
 *
 *   node scripts/check-whatsapp-ai-config.mjs [--env=.env]
 *
 * Não altera nada: só lê as variáveis e imprime o que falta.
 * Sai com código 1 se algum item obrigatório estiver ausente.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const envFileArg = args.find(arg => arg.startsWith('--env='));
const envFile = envFileArg ? envFileArg.slice('--env='.length) : '.env';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(resolve(process.cwd(), envFile));
const get = key => (process.env[key] ?? fileEnv[key] ?? '').trim();

const MIN_SECRET_LENGTH = 32;

const checks = [
  {
    id: 'EVOLUTION_API_URL',
    required: true,
    label: 'URL da API Evolution',
    test: value => value.length > 0,
    hint: 'Ex.: https://evolution.exemplo.com',
  },
  {
    id: 'EVOLUTION_API_KEY',
    required: true,
    label: 'Chave da API Evolution',
    test: value => value.length > 0,
    hint: 'Token global da Evolution (instância da plataforma + IA)',
  },
  {
    id: 'EVOLUTION_AI_INSTANCE_NAME',
    required: true,
    label: 'Instância Evolution do atendente de IA',
    test: value => value.length > 0,
    hint: 'Instância PRÓPRIA do atendente (não pode ser a da plataforma)',
  },
  {
    id: 'EVOLUTION_INSTANCE_NAME',
    required: false,
    label: 'Instância Evolution da plataforma (assistente do dono)',
    test: value => value.length > 0,
    hint: 'Opcional. Só o assistant do dono usa essa instância.',
  },
  {
    id: 'EVOLUTION_WEBHOOK_SECRET',
    required: true,
    label: 'Segredo do webhook Evolution',
    test: value => value.length >= MIN_SECRET_LENGTH,
    hint: `Mínimo de ${MIN_SECRET_LENGTH} caracteres (openssl rand -hex 32)`,
  },
  {
    id: 'DATABASE_URL',
    required: true,
    label: 'Banco de dados',
    test: value => value.length > 0,
    hint: 'Postgres com as migrations aplicadas',
  },
  {
    id: 'REDIS_URL',
    required: true,
    label: 'Fila (BullMQ)',
    test: value => value.length > 0,
    hint: 'Redis usado pela fila whatsapp-ai',
  },
];

const results = checks.map(check => {
  const value = get(check.id);
  return { ...check, value, ok: check.test(value) };
});

const aiInstance = get('EVOLUTION_AI_INSTANCE_NAME');
const platformInstance = get('EVOLUTION_INSTANCE_NAME');
const conflicts = Boolean(aiInstance && platformInstance && aiInstance === platformInstance);

const webhookBase = get('EVOLUTION_WEBHOOK_SECRET')
  ? `${get('EVOLUTION_API_URL') || 'https://<api-evolution>'}/webhook/set/${aiInstance || '<instancia-ia>'}`
  : null;

console.log('\nAtendente de IA no WhatsApp — verificação de configuração');
console.log('='.repeat(60));
for (const result of results) {
  const marker = result.ok ? 'OK  ' : result.required ? 'FALHA' : 'AVISO';
  console.log(`[${marker}] ${result.id} — ${result.label}`);
  if (!result.ok) console.log(`        → ${result.hint}`);
}
if (conflicts) {
  console.log(
    '[FALHA] EVOLUTION_AI_INSTANCE_NAME é igual a EVOLUTION_INSTANCE_NAME — o assistente do dono e o atendente de IA vão responder a mesma mensagem. Use uma instância separada.'
  );
}

if (webhookBase) {
  console.log('\nWebhook a configurar na instância da IA (POST, header x-webhook-secret):');
  console.log(`  ${webhookBase}`);
  console.log('  events: messages.upsert');
}

console.log('\nLembrete: o atendente só responde para salões com whatsappAiEnabled = true.');
console.log('='.repeat(60));

const failed = results.filter(result => !result.ok && result.required).length;
if (failed > 0 || conflicts) {
  console.error(`\n${failed} item(ns) obrigatório(s) ausente(s).`);
  process.exit(1);
}
console.log('\nConfiguração OK.');
