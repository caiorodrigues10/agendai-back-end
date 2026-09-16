# Cloudinary — Fallback de Storage AgendAI

O Cloudinary é usado como **provedor reserva** (fallback) para uploads de imagem. Se o Google Cloud Storage falhar, o upload é automaticamente tentado no Cloudinary, sem interromper a experiência do usuário.

---

## Variáveis de ambiente

Em `backend/.env`:

```env
# ─── Cloudinary (fallback) ────────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=dxkxxxxx
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=seu-secret-aqui
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `CLOUDINARY_CLOUD_NAME` | Sim | Nome do cloud (aparece na URL: `res.cloudinary.com/<cloud_name>`) |
| `CLOUDINARY_API_KEY` | Sim | Chave de API do Cloudinary |
| `CLOUDINARY_API_SECRET` | Sim | Segredo da API (nunca commitar no Git) |

---

## Como funciona o fallback

```
Upload de imagem
    │
    ▼
┌─────────────────────┐
│  GCS (primário)     │──── sucesso ──── URL do GCS salva no banco
└─────────────────────┘
    │ falha
    ▼
┌─────────────────────┐
│  Cloudinary (reserva)│──── sucesso ──── URL do Cloudinary salva no banco
└─────────────────────┘
    │ falha
    ▼
Erro propagado ao usuário
```

- Se o GCS funciona: Cloudinary **nunca é chamado**
- Se o GCS falha e Cloudinary funciona: upload salva via Cloudinary, log de warning
- Se ambos falham: erro do Cloudinary é propagado
- Se Cloudinary não está configurado: erro do GCS é propagado normalmente

---

## Setup rápido

### 1. Criar conta no Cloudinary

Acesse [cloudinary.com](https://cloudinary.com) e crie uma conta gratuita.

### 2. Copiar credenciais

No painel do Cloudinary, vá em **Settings → Access Keys** e copie:
- Cloud Name
- API Key
- API Secret

### 3. Adicionar ao `.env`

```env
CLOUDINARY_CLOUD_NAME=seu-cloud-name
CLOUDINARY_API_KEY=sua-api-key
CLOUDINARY_API_SECRET=seu-api-secret
```

### 4. (Opcional) Criar pasta folders

O Cloudinary cria pastas automaticamente no primeiro upload. Se preferir criar antecipadamente:

```
logos/
products/
feeds/
documents/
avatars/
```

---

## URLs públicas

Imagens do Cloudinary ficam acessíveis em:
```
https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/image/upload/<public_id>
```

Exemplo:
```
https://res.cloudinary.com/dxkxxxxx/image/upload/products/product-uuid-12345678
```

---

## Comportamento por cenário

| Cenário | GCS | Cloudinary | Resultado |
|---------|-----|------------|-----------|
| Ambos configurados e funcionando | ✅ | ✅ | Usa GCS (primário) |
| GCS falha, Cloudinary OK | ❌ | ✅ | Fallback para Cloudinary |
| GCS OK, Cloudinary não configurado | ✅ | ⚠️ | Usa GCS |
| Ambos falham | ❌ | ❌ | Erro propagado |
| Nenhum configurado | ⚠️ | ⚠️ | Erro na inicialização |

---

## Notas técnicas

- O `FallbackStorageProvider` resolve `"StorageProvider"` no container de DI
- `GcsStorageProvider` e `CloudinaryStorageProvider` também estão registrados individualmente para testes
- `extractObjectName` verifica primeiro a URL do GCS, depois a do Cloudinary
- `generateSignedUploadUrl` no Cloudinary usa assinatura via `api_sign_request`
- `deleteObject` é idempotente (404 silencioso) em ambos os providers
