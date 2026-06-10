#!/usr/bin/env bash
# Garante que gcs-key.json existe antes do docker compose up.
# Se não existir, cria um placeholder JSON para o mount não falhar.
set -euo pipefail

KEY_FILE="$(dirname "$0")/../gcs-key.json"

if [[ -f "$KEY_FILE" ]]; then
  # Verifica se é um JSON real de service account
  if python3 -c "
import json, sys
try:
    d = json.load(open('$KEY_FILE'))
    sys.exit(0 if d.get('type') == 'service_account' else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "[✓] gcs-key.json encontrado e válido."
  else
    echo "[!] gcs-key.json existe mas não é uma service account key válida."
    echo "    Upload de imagens não funcionará até você fornecer a chave correta."
    echo "    Execute: bash scripts/create-service-account.sh"
  fi
else
  echo "[→] gcs-key.json não encontrado. Criando placeholder..."
  cat > "$KEY_FILE" << 'PLACEHOLDER'
{
  "_placeholder": true,
  "_message": "Substitua pelo arquivo JSON real da Service Account do GCP.",
  "_howto": "Execute: bash scripts/create-service-account.sh"
}
PLACEHOLDER
  echo "[✓] Placeholder criado. Upload de imagens desabilitado até configurar o GCS."
  echo "    Para configurar: bash scripts/create-service-account.sh"
fi
