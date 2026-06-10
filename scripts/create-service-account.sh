#!/usr/bin/env bash
# Cria a Service Account para a API e gera a chave JSON.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[→]${NC}  $*"; }
ok()      { echo -e "${GREEN}[✓]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[!]${NC}  $*"; }
err()     { echo -e "${RED}[✗]${NC}  $*"; exit 1; }

ENV_FILE="$(dirname "$0")/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source <(grep -E '^[A-Z_]+=.+' "$ENV_FILE" | sed 's/#.*//')
  set +a
fi

PROJECT_ID="${GCS_PROJECT_ID:-}"
[[ -z "$PROJECT_ID" || "$PROJECT_ID" == "seu-project-id-aqui" ]] && \
  err "GCS_PROJECT_ID não configurado no .env"

SA_NAME="barberqueue-api"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_OUTPUT="$(cd "$(dirname "$0")/.." && pwd)/gcs-key.json"

info "Projeto : $PROJECT_ID"
info "SA      : $SA_EMAIL"
info "Chave   : $KEY_OUTPUT"

gcloud config set project "$PROJECT_ID" --quiet

# Criar SA (idempotente)
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  warn "Service Account $SA_EMAIL já existe — pulando criação."
else
  info "Criando Service Account..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="BarberQueue API Service Account" \
    --project="$PROJECT_ID"
  ok "Service Account criada"
fi

# Papel Storage Object Admin
info "Concedendo papel Storage Object Admin..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --condition=None --quiet
ok "Papel concedido"

# Gerar chave JSON
[[ -f "$KEY_OUTPUT" ]] && warn "Sobrescrevendo $KEY_OUTPUT..."
info "Gerando chave JSON..."
gcloud iam service-accounts keys create "$KEY_OUTPUT" \
  --iam-account="$SA_EMAIL" --project="$PROJECT_ID"
chmod 600 "$KEY_OUTPUT"
ok "Chave salva em: $KEY_OUTPUT"

# Atualizar .env
if [[ -f "$ENV_FILE" ]]; then
  if grep -q "GCS_KEY_FILE_PATH" "$ENV_FILE"; then
    sed -i.bak "s|^GCS_KEY_FILE_PATH=.*|GCS_KEY_FILE_PATH=${KEY_OUTPUT}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    echo "GCS_KEY_FILE_PATH=${KEY_OUTPUT}" >> "$ENV_FILE"
  fi
  if grep -q "GCS_SA_EMAIL" "$ENV_FILE"; then
    sed -i.bak "s|^GCS_SA_EMAIL=.*|GCS_SA_EMAIL=${SA_EMAIL}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    echo "GCS_SA_EMAIL=${SA_EMAIL}" >> "$ENV_FILE"
  fi
  ok ".env atualizado"
fi

echo ""
echo -e "${GREEN}Próximo passo: bash scripts/setup-gcs.sh${NC}"
