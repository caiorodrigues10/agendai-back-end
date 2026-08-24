#!/usr/bin/env bash
# Garante que gcs-key.json existe como ARQUIVO antes do docker compose up.
# Se não existir, cria um placeholder JSON para o mount não falhar.
# Guia completo: docs/GCS_SETUP.md
set -euo pipefail

KEY_FILE="$(cd "$(dirname "$0")/.." && pwd)/gcs-key.json"

# Docker Desktop às vezes cria um diretório no path do bind mount quando o arquivo faltava.
if [[ -d "$KEY_FILE" ]]; then
  echo "[✗] $KEY_FILE é um DIRETÓRIO (mount Docker inválido)."
  echo "    Remova: rm -rf \"$KEY_FILE\""
  echo "    Depois rode este script de novo, ou copie a chave real da SA."
  echo "    Guia: docs/GCS_SETUP.md"
  exit 1
fi

if [[ -f "$KEY_FILE" ]]; then
  if python3 -c "
import json, sys
try:
    d = json.load(open(r'$KEY_FILE'))
    sys.exit(0 if d.get('type') == 'service_account' and d.get('private_key') else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "[✓] gcs-key.json encontrado e válido (service_account)."
  else
    echo "[!] gcs-key.json existe mas não é uma service account key válida."
    echo "    Upload de imagens não funcionará até você fornecer a chave correta."
    echo "    Execute: bash scripts/create-service-account.sh"
    echo "    Guia: docs/GCS_SETUP.md"
  fi
else
  echo "[→] gcs-key.json não encontrado. Criando placeholder..."
  cat > "$KEY_FILE" << 'PLACEHOLDER'
{
  "_placeholder": true,
  "_message": "Substitua pelo arquivo JSON real da Service Account do GCP.",
  "_howto": "Veja docs/GCS_SETUP.md — bash scripts/create-service-account.sh"
}
PLACEHOLDER
  echo "[✓] Placeholder criado. Upload de imagens desabilitado até configurar o GCS."
  echo "    Guia: docs/GCS_SETUP.md"
  echo "    Atalho: bash scripts/create-service-account.sh && bash scripts/setup-gcs.sh"
fi
