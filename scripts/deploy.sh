#!/usr/bin/env bash
# =============================================================================
# AgendAI - Production Deploy Script
# =============================================================================
# Uso: ./scripts/deploy.sh [prod|staging]
# =============================================================================

set -euo pipefail

ENV="${1:-prod}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Iniciando deploy $ENV..."
echo "📁 Diretório: $ROOT_DIR"

cd "$ROOT_DIR"

# Verifica .env
if [[ ! -f .env ]]; then
  echo "❌ Arquivo .env não encontrado. Copie .env.example e preencha."
  exit 1
fi

# Carrega variáveis
set -a
source .env
set +a

# Validações críticas
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL não definido no .env"
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]] || [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "❌ JWT_SECRET deve ter pelo menos 32 caracteres"
  exit 1
fi

if [[ -z "${JWT_REFRESH_SECRET:-}" ]] || [[ ${#JWT_REFRESH_SECRET} -lt 32 ]]; then
  echo "❌ JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres"
  exit 1
fi

if [[ -z "${ASAAS_API_KEY:-}" ]]; then
  echo "⚠️  ASAAS_API_KEY não definido - pagamentos não funcionarão"
fi

if [[ -z "${ASAAS_WEBHOOK_TOKEN:-}" ]]; then
  echo "⚠️  ASAAS_WEBHOOK_TOKEN não definido - webhooks não funcionarão"
fi

echo "✅ Variáveis validadas"

# Instala dependências
echo "📦 Instalando dependências..."
npm ci --production=false

# Gera Prisma Client
echo "🔧 Gerando Prisma Client..."
npx prisma generate

# Migrações
if [[ "$ENV" == "prod" ]]; then
  echo "🗄️  Executando migrações de produção..."
  npx prisma migrate deploy
else
  echo "🗄️  Sincronizando schema (dev/staging)..."
  npx prisma db push
fi

# Seed (apenas em dev/staging vazio)
if [[ "$ENV" != "prod" ]]; then
  echo "🌱 Executando seed..."
  npx prisma db seed || true
fi

# Build
echo "🏗️  Buildando aplicação..."
npm run build

echo "✅ Deploy $ENV concluído com sucesso!"
echo ""
echo "Para iniciar:"
echo "  npm run start:prod   # Produção (com migrações)"
echo "  npm run start        # Desenvolvimento"