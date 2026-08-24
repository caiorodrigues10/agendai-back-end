# Google Cloud Storage — setup AgendAI

Guia único para configurar bucket, Service Account e chave JSON usados no upload de logos.

O código (signed URL → PUT no browser → confirm) já está implementado. Sem credenciais reais o servidor sobe, mas o upload retorna **503** com mensagem apontando para este doc.

---

## Pré-requisitos

1. Conta Google Cloud com billing ativo (GCS tem free tier generoso para logos).
2. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` + `gsutil`).
3. Autenticação local:

```bash
gcloud auth login
gcloud auth application-default login   # opcional, útil para outros comandos
```

---

## Passo a passo

### 1. Projeto GCP

Crie um projeto no [Console](https://console.cloud.google.com/) (ou use um existente) e anote o **Project ID**.

```bash
gcloud config set project SEU_PROJECT_ID
gcloud config get-value project
```

### 2. Variáveis no `.env`

Em `agendai-back-end/.env` (copie de `.env.example` se ainda não tiver):

```env
GCS_BUCKET_NAME=agendai-assets
GCS_PROJECT_ID=seu-project-id-real
GCS_REGION=us-central1
```

- `GCS_BUCKET_NAME` precisa ser **globalmente único** no GCS. Se `agendai-assets` estiver ocupado, use algo como `agendai-assets-<seu-nome>`.
- Não preencha ainda `GCS_KEY_FILE_PATH` / `GCS_SA_EMAIL` — o script da SA atualiza isso.

### 3. Criar Service Account + chave JSON

Na pasta do backend:

```bash
cd agendai-back-end
bash scripts/create-service-account.sh
```

O script:

- Cria a SA `agendai-api@<PROJECT_ID>.iam.gserviceaccount.com`
- Concede `roles/storage.objectAdmin` no projeto
- Gera **`gcs-key.json`** na raiz do backend (já está no `.gitignore`)
- Atualiza `GCS_KEY_FILE_PATH` e `GCS_SA_EMAIL` no `.env`

Confirme que o JSON tem `"type": "service_account"` e um campo `private_key` (não `_placeholder`).

### 4. Bucket, CORS, IAM público e pastas

```bash
bash scripts/setup-gcs.sh
```

O script:

- Habilita APIs de Storage/IAM
- Cria o bucket (se não existir) com Uniform Bucket-Level Access
- Libera leitura pública (`allUsers` → `objectViewer`) — necessário para `<img src="…">` das logos
- Aplica CORS a partir de [`cors.json`](../cors.json) (origins localhost do front; edite o arquivo para produção)
- Cria prefixos `logos/`, `feeds/`, `documents/`
- Concede `objectAdmin` da SA no bucket
- Lifecycle **apenas** em `tmp/` (7 dias) — **não** apaga `logos/`

### 5. Rodar a API

**Local (sem Docker):**

```env
GCS_KEY_FILE_PATH=/caminho/absoluto/para/agendai-back-end/gcs-key.json
```

```bash
npm run dev
```

**Docker:**

O compose monta `./gcs-key.json` → `/run/secrets/gcs-key.json` e força `GCS_KEY_FILE_PATH` para esse path.

```bash
bash scripts/ensure-gcs-key.sh   # cria placeholder se o arquivo não existir (upload só com chave real)
docker compose up --build
```

> Se `gcs-key.json` for um **diretório** (Docker Desktop às vezes cria isso quando o arquivo não existia), apague a pasta e rode `ensure-gcs-key.sh` de novo, ou copie a chave real no lugar.

### 6. Smoke test

1. Login como OWNER no front (`/app/settings` ou aba Configurações).
2. Escolher imagem JPEG/PNG/WebP (até 5 MB no fluxo multipart; signed URL usa o MIME informado).
3. A logo deve aparecer em:

`https://storage.googleapis.com/<GCS_BUCKET_NAME>/logos/barbershop-...`

Se falhar:

| Sintoma | Causa comum |
|--------|-------------|
| 503 com “placeholder” / “service_account” | Ainda não rodou `create-service-account.sh` ou JSON inválido |
| PUT do browser falha (CORS / Network) | `setup-gcs.sh` não rodou, ou origin do front fora de `cors.json` |
| 403 no GCS | SA sem `objectAdmin` no bucket |
| Confirm 400 “logoUrl inválida” | `GCS_BUCKET_NAME` / `GCS_PUBLIC_BASE_URL` diferente da URL gerada |

---

## Alternativa: `GCS_CREDENTIALS_JSON`

Em vez de arquivo montado, cole o JSON da SA (ou base64) em:

```env
GCS_CREDENTIALS_JSON={"type":"service_account",...}
# ou
# GCS_CREDENTIALS_JSON=<base64 do JSON>
```

Deixe `GCS_KEY_FILE_PATH` vazio nesse caso. Útil em PaaS sem volume de secret file.

## Produção (Cloud Run / GKE)

Prefira **Workload Identity / ADC** e deixe `GCS_KEY_FILE_PATH` e `GCS_CREDENTIALS_JSON` vazios. Ainda defina `GCS_BUCKET_NAME` e `GCS_PROJECT_ID`.

Atualize `cors.json` com o domínio do front e rode de novo `gsutil cors set cors.json gs://$GCS_BUCKET_NAME`.

## Scripts relacionados

| Script | Função |
|--------|--------|
| `scripts/create-service-account.sh` | SA + chave JSON + patch do `.env` |
| `scripts/setup-gcs.sh` | Bucket + IAM + CORS + pastas + lifecycle |
| `scripts/ensure-gcs-key.sh` | Garante arquivo para o mount Docker (placeholder se necessário) |

## Rotação de chave

1. `gcloud iam service-accounts keys create novo.json --iam-account=$GCS_SA_EMAIL`
2. Substitua `gcs-key.json` (ou a secret no host)
3. Reinicie a API
4. Delete a chave antiga no Console IAM → Service Accounts → Keys
