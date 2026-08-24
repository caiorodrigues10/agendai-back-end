#!/usr/bin/env bash
# Cria e configura o bucket GCS (IAM público, CORS, lifecycle, pastas).
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

BUCKET_NAME="${GCS_BUCKET_NAME:-}"
PROJECT_ID="${GCS_PROJECT_ID:-}"
REGION="${GCS_REGION:-us-central1}"
SA_EMAIL="${GCS_SA_EMAIL:-}"

[[ -z "$BUCKET_NAME" ]]                              && err "GCS_BUCKET_NAME não definido no .env"
[[ -z "$PROJECT_ID" || "$PROJECT_ID" == "seu-project-id-aqui" ]] && err "GCS_PROJECT_ID não definido no .env"

info "Projeto : $PROJECT_ID"
info "Bucket  : $BUCKET_NAME"
info "Região  : $REGION"

# Verificar autenticação
gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q . || \
  err "Nenhuma conta ativa. Execute: gcloud auth login"

gcloud config set project "$PROJECT_ID" --quiet
ok "Projeto configurado"

# Habilitar APIs
info "Habilitando APIs GCP..."
gcloud services enable storage.googleapis.com storage-component.googleapis.com \
  iam.googleapis.com --project="$PROJECT_ID" --quiet
ok "APIs habilitadas"

# Criar bucket
if gsutil ls -b "gs://$BUCKET_NAME" &>/dev/null; then
  warn "Bucket gs://$BUCKET_NAME já existe — pulando criação."
else
  info "Criando bucket..."
  gsutil mb -p "$PROJECT_ID" -c STANDARD -l "$REGION" -b on "gs://$BUCKET_NAME"
  ok "Bucket criado: gs://$BUCKET_NAME"
fi

# Garantir Uniform Bucket-Level Access
info "Verificando Uniform Bucket-Level Access..."
UBA=$(gsutil uniformbucketlevelaccess get "gs://$BUCKET_NAME" 2>/dev/null | grep -c "Enabled: True" || true)
if [[ "$UBA" -eq 0 ]]; then
  gsutil uniformbucketlevelaccess set on "gs://$BUCKET_NAME"
  ok "Uniform Bucket-Level Access ativado"
else
  ok "Uniform Bucket-Level Access já ativo"
fi

# Leitura pública via IAM
info "Configurando leitura pública (IAM allUsers → objectViewer)..."
gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME"
ok "Leitura pública habilitada"

# CORS (fonte única: cors.json do repo — edite lá para origins de produção)
info "Aplicando CORS..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORS_FILE="${SCRIPT_DIR}/../cors.json"
[[ -f "$CORS_FILE" ]] || err "cors.json não encontrado em $CORS_FILE"
gsutil cors set "$CORS_FILE" "gs://$BUCKET_NAME"
ok "CORS aplicado a partir de cors.json"

# Pastas lógicas
info "Criando estrutura de pastas..."
for FOLDER in logos feeds documents; do
  if ! gsutil -q stat "gs://$BUCKET_NAME/$FOLDER/.keep" 2>/dev/null; then
    echo "" | gsutil cp - "gs://$BUCKET_NAME/$FOLDER/.keep"
    ok "Pasta criada: $FOLDER/"
  else
    warn "Pasta já existe: $FOLDER/"
  fi
done

# Permissão para a SA
if [[ -n "$SA_EMAIL" ]]; then
  info "Concedendo objectAdmin para $SA_EMAIL..."
  gsutil iam ch "serviceAccount:${SA_EMAIL}:roles/storage.objectAdmin" "gs://$BUCKET_NAME"
  ok "Permissão concedida para $SA_EMAIL"
else
  warn "GCS_SA_EMAIL não definido — configure manualmente se necessário."
fi

# Lifecycle: só limpa tmp/ — NÃO apaga logos/ feeds/ documents/
info "Configurando lifecycle (tmp/ com 7 dias)..."
LC_FILE="$(mktemp /tmp/gcs-lc-XXXX.json)"
cat > "$LC_FILE" << 'LC'
{"rule":[
  {"action":{"type":"Delete"},"condition":{"age":7,"matchesPrefix":["tmp/"]}}
]}
LC
gsutil lifecycle set "$LC_FILE" "gs://$BUCKET_NAME"
rm -f "$LC_FILE"
ok "Lifecycle configurado (apenas tmp/)"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Bucket configurado com sucesso!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  URL pública : https://storage.googleapis.com/$BUCKET_NAME"
echo "  Console     : https://console.cloud.google.com/storage/browser/$BUCKET_NAME"
echo ""
echo "  Guia completo: docs/GCS_SETUP.md"
echo "  Próximo passo: bash scripts/ensure-gcs-key.sh && docker compose up -d"
echo ""
