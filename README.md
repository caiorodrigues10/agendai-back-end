# 💈 AgendAI — Backend API

API REST completa para gestão de barbearias: fila digital, agendamentos, fiado, despesas, pagamentos via Mercado Pago, assinaturas de planos e painel administrativo.

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Pré-requisitos](#pré-requisitos)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Como Rodar](#como-rodar)
  - [Com Docker (recomendado)](#com-docker-recomendado)
  - [Sem Docker (local)](#sem-docker-local)
- [Monitor de Rotas em Tempo Real](#monitor-de-rotas-em-tempo-real)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Autenticação](#autenticação)
- [Roles e Permissões](#roles-e-permissões)
- [Referência Completa de Rotas](#referência-completa-de-rotas)
  - [Health Check](#health-check)
  - [Auth](#auth)
  - [Usuários](#usuários)
  - [Barbearias](#barbearias)
  - [Serviços](#serviços)
  - [Fila (Queue)](#fila-queue)
  - [Agendamentos](#agendamentos)
  - [Fiado](#fiado)
  - [Despesas](#despesas)
  - [Financeiro da Barbearia](#financeiro-da-barbearia)
  - [Categorias](#categorias)
  - [Pagamentos](#pagamentos)
  - [Planos](#planos)
  - [Assinaturas](#assinaturas)
  - [Admin — Dashboard](#admin--dashboard)
  - [Admin — Barbearias](#admin--barbearias)
  - [Admin — Usuários](#admin--usuários)
  - [Admin — Planos](#admin--planos)
  - [Admin — Assinaturas](#admin--assinaturas)
  - [Admin — Financeiro](#admin--financeiro)
  - [Admin — Audit Logs](#admin--audit-logs)
  - [Admin — Notificações](#admin--notificações)
  - [Admin — Entidades Bloqueadas](#admin--entidades-bloqueadas)
- [Schemas do Banco de Dados](#schemas-do-banco-de-dados)
- [Sistema de Assinaturas](#sistema-de-assinaturas)
- [Sistema de Bloqueio de CPF](#sistema-de-bloqueio-de-cpf)
- [Upload de Logo](#upload-de-logo)
- [Testes](#testes)
- [Documentação Swagger](#documentação-swagger)

---

## Visão Geral

O AgendAI é uma plataforma SaaS para salões, barbearias e studios que oferece:

- **Fila digital** — clientes entram na fila sem precisar de conta
- **Agendamentos** — marcação de horários com funcionários
- **Fiado** — controle de créditos com clientes
- **Despesas** — gestão financeira interna
- **Pagamentos** — integração com Mercado Pago (cartão e PIX)
- **Assinaturas** — planos mensais/anuais com trial de 30 dias
- **Painel Admin** — dashboard completo para o master admin da plataforma

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Framework HTTP | Fastify 4 |
| ORM | Prisma 7 (driver pg) |
| Banco de dados | PostgreSQL 16 |
| Autenticação | JWT (access 15min + refresh 7d) |
| Pagamentos | Mercado Pago SDK v3 |
| Storage | Google Cloud Storage |
| Validação | Zod |
| DI Container | TSyringe |
| Linguagem | TypeScript 5 |
| Testes | Vitest |
| Containerização | Docker + Docker Compose |

---

## Pré-requisitos

- **Node.js** >= 22
- **Docker** e **Docker Compose** (para rodar com containers)
- **Git**

---

## Configuração do Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco de dados
DATABASE_URL="postgresql://agendai:agendai123@localhost:5432/agendai_db"

# JWT
JWT_SECRET="sua-chave-secreta-jwt"
JWT_REFRESH_SECRET="sua-chave-secreta-refresh"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Servidor
PORT=3333
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:3002,http://localhost:5173"

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=TEST-xxxx-xxxx
MERCADOPAGO_WEBHOOK_SECRET=seu-segredo-webhook

# Google Cloud Storage
GCS_BUCKET_NAME=agendai-assets
GCS_PROJECT_ID=seu-project-id-aqui
GCS_KEY_FILE_PATH=/caminho/absoluto/para/agendai-api-xxxx.json
```

> **Nota GCS:** Se não tiver credenciais do GCS, crie um arquivo placeholder para o Docker não falhar:
> ```bash
> echo '{}' > gcs-key.json
> ```
> O servidor sobe normalmente; o erro só ocorre ao tentar fazer upload de logo.

---

## Como Rodar

### Com Docker (recomendado)

```bash
# 1. Clone o repositório
git clone <url-do-repo>
cd agendai-back-end

# 2. Crie o arquivo placeholder da chave GCS (se não tiver a chave real)
echo '{}' > gcs-key.json

# 3. Configure o .env (copie o exemplo acima)

# 4. Suba os containers
docker compose up --build

# A API estará disponível em: http://localhost:3333
# O banco de dados na porta 5432
```

O Docker Compose executa automaticamente:
1. Sobe o PostgreSQL e aguarda ele ficar saudável
2. Roda `prisma generate` para gerar o client
3. Roda `prisma db push` para criar as tabelas
4. Roda o seed (`npm run prisma:seed`) criando o admin e os planos padrão
5. Inicia o servidor em modo watch

**Credenciais do admin criadas pelo seed:**
```
Email: admin@agendai.local
Senha: admin123
```

### Sem Docker (local)

```bash
# 1. Instale as dependências
npm install

# 2. Suba um PostgreSQL local (ou ajuste o DATABASE_URL para um remoto)

# 3. Gere o Prisma client
npm run prisma:generate

# 4. Crie as tabelas
npx prisma db push

# 5. Rode o seed
npm run prisma:seed

# 6. Inicie o servidor em desenvolvimento
npm run dev

# A API estará em: http://localhost:3333
```

**Scripts disponíveis:**

| Script | Descrição |
|---|---|
| `npm run dev` | Inicia em modo watch com .env |
| `npm run build` | Compila para dist/ |
| `npm start` | Inicia a versão compilada |
| `npm test` | Roda todos os testes |
| `npm run test:watch` | Testes em modo watch |
| `npm run prisma:migrate` | Cria e aplica migration |
| `npm run prisma:seed` | Popula o banco com dados iniciais |
| `npm run prisma:studio` | Abre o Prisma Studio (GUI do banco) |

---

## Monitor de Rotas em Tempo Real

O projeto inclui um script de monitoramento que verifica o status de todas as rotas da API em tempo real, exibindo um dashboard colorido no terminal.

### Uso básico

```bash
# Monitorar com configurações padrão (http://localhost:3333/api, intervalo de 10s)
node monitor-routes.js

# Especificar URL base
node monitor-routes.js --url http://localhost:3333/api

# Especificar intervalo de atualização (em segundos)
node monitor-routes.js --url http://localhost:3333/api --interval 5

# Incluir token JWT para testar rotas autenticadas
node monitor-routes.js --url http://localhost:3333/api --token SEU_JWT_AQUI
```

### Como obter o token JWT para o monitor

```bash
# 1. Faça login na API e copie o accessToken da resposta
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agendai.local","password":"admin123"}'

# 2. Use o token no monitor
node monitor-routes.js --url http://localhost:3333/api --token eyJhbGciOiJIUz...
```

### O que o monitor exibe

- **Status de cada rota:** OK (verde), DOWN (vermelho), 404 (vermelho), ERROR (amarelo)
- **Método HTTP e caminho** da rota
- **Código de status HTTP** retornado
- **Tempo de resposta** em milissegundos
- **Ícone de cadeado** 🔒 para rotas autenticadas
- **Agrupamento** por módulo (Auth, Barbershops, Queue, Payments, etc.)
- **Contadores** globais de rotas UP/DOWN/ERROR
- **Legenda** explicando os indicadores

### Interpretação dos status

| Badge | Significado |
|---|---|
| **OK** (verde) | Rota responde (2xx, 3xx ou 4xx — servidor está de pé) |
| **DOWN** (vermelho) | Servidor não responde / timeout |
| **404** (vermelho) | Rota não encontrada |
| **ERR** (amarelo) | Erro 5xx do servidor |

> **Importante:** Rotas autenticadas retornam 401 sem token — o monitor trata isso como **OK** porque significa que a rota existe e está funcionando; apenas exige autenticação. Passe `--token` para ver respostas reais.

### Requisitos do monitor

- Node.js instalado (sem dependências extras — usa apenas módulos nativos)
- A API deve estar rodando antes de iniciar o monitor
- Funciona em Linux, macOS e Windows

---

## Estrutura do Projeto

```
src/
├── config/                    # Configurações (auth, swagger)
├── libs/                      # Instância do Prisma
├── modules/
│   ├── admin/                 # Painel administrativo
│   ├── appointments/          # Agendamentos
│   ├── auth/                  # Autenticação (login, refresh, me)
│   ├── barbershops/           # Barbearias e logo
│   ├── expenses/              # Despesas
│   ├── fiado/                 # Controle de fiado
│   ├── payments/              # Pagamentos (Mercado Pago)
│   ├── plans/                 # Planos de assinatura
│   ├── queue/                 # Fila de atendimento
│   ├── serviceCategories/     # Categorias de serviços e despesas
│   ├── services/              # Serviços oferecidos
│   ├── subscriptions/         # Assinaturas
│   └── users/                 # Usuários
├── shared/
│   ├── container/             # Injeção de dependências (TSyringe)
│   │   └── providers/         # HashProvider, DateProvider, StorageProvider
│   ├── constants/             # Mensagens e configurações globais
│   ├── errors/                # AppError
│   ├── infra/http/
│   │   ├── app.ts             # Instância do Fastify + plugins
│   │   ├── middlewares/       # authenticate, authorize, checkSubscription
│   │   ├── routes/            # Arquivos de rota por módulo
│   │   └── server.ts          # Entry point
│   ├── services/              # blockedEntityService
│   └── utils/                 # cpfUtils, zodValidation
prisma/
├── schema.prisma              # Schema do banco
└── seed.ts                    # Dados iniciais
```

---

## Autenticação

A API usa **JWT Bearer Token** no header `Authorization`:

```
Authorization: Bearer <accessToken>
```

**Tokens:**
- **Access Token:** Expira em 15 minutos. Usado em todas as requisições autenticadas.
- **Refresh Token:** Expira em 7 dias. Usado apenas no endpoint `/auth/refresh` para renovar o access token.

**Fluxo:**
1. POST `/api/auth/login` → recebe `accessToken` + `refreshToken`
2. Use `accessToken` nas requisições
3. Quando expirar (401), use POST `/api/auth/refresh` com o `refreshToken`
4. Recebe novos tokens (rotação automática do refresh token)

---

## Roles e Permissões

| Role | Descrição |
|---|---|
| `MASTER_ADMIN` | Administrador da plataforma. Acesso total. Sem barbearia vinculada. |
| `OWNER` | Proprietário de barbearia. Acesso completo à própria barbearia. |
| `EMPLOYEE` | Funcionário. Acesso limitado à própria barbearia (sem cancelamentos, sem financeiro). |

**Verificação de assinatura (`checkSubscription`):**  
Todas as rotas operacionais de barbearias (fila, agendamentos, serviços, fiado, despesas) verificam se a barbearia tem acesso ativo antes de processar. `MASTER_ADMIN` é isento desta verificação.

**Período de trial:** 30 dias a partir da criação da barbearia. Após isso, é necessária uma assinatura ativa.

---

## Referência Completa de Rotas

> **Base URL:** `http://localhost:3333/api`  
> 🔒 = Requer autenticação (Bearer Token)  
> 🛡️ = Requer role específica  
> 📋 = Requer assinatura ativa

---

### Health Check

#### `GET /health`
Verifica se o servidor está de pé.

- **Auth:** Não requerida
- **URL:** `http://localhost:3333/health` *(sem prefixo /api)*

**Resposta 200:**
```json
{ "status": "ok" }
```

---

### Auth

#### `POST /auth/login`
Autentica um usuário e retorna os tokens de acesso.

- **Auth:** Não requerida

**Body:**
```json
{
  "email": "admin@agendai.local",
  "password": "admin123"
}
```

**Resposta 200:**
```json
{
  "user": {
    "id": "uuid",
    "name": "Administrador",
    "email": "admin@agendai.local",
    "role": "admin",
    "barbershopId": null
  },
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

> **Mapeamento de roles na resposta:** `MASTER_ADMIN` → `"admin"`, `OWNER` → `"owner"`, `EMPLOYEE` → `"employee"`

**Erros comuns:**
- `400` — Credenciais inválidas (email não encontrado, senha errada ou usuário inativo)
- `402` — Assinatura expirada (retorna lista de planos disponíveis)
- `403` — CPF bloqueado por inadimplência

---

#### `POST /auth/refresh`
Renova o access token usando o refresh token. O refresh token antigo é invalidado e um novo é retornado.

- **Auth:** Não requerida

**Body:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Resposta 200:**
```json
{
  "user": { "id": "uuid", "name": "...", "email": "...", "role": "...", "barbershopId": "..." },
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

---

#### `GET /auth/me` 🔒
Retorna os dados do usuário autenticado.

**Resposta 200:**
```json
{
  "user": {
    "id": "uuid",
    "name": "Nome do Usuário",
    "email": "email@exemplo.com",
    "role": "owner",
    "barbershopId": "uuid-da-barbearia"
  }
}
```

---

### Usuários

#### `POST /users`
Cria um novo usuário (owner ou employee de uma barbearia).

- **Auth:** Não requerida (cadastro público)

**Body:**
```json
{
  "name": "João Silva",
  "email": "joao@exemplo.com",
  "password": "minhasenha123",
  "role": "OWNER",
  "barbershopId": "uuid-da-barbearia",
  "cpf": "529.982.247-25"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Nome completo (3–200 chars) |
| `email` | string | ✅ | E-mail válido |
| `password` | string | ✅ | Senha (6–100 chars) |
| `role` | enum | ❌ | `MASTER_ADMIN`, `OWNER`, `EMPLOYEE` (default: `EMPLOYEE`) |
| `barbershopId` | UUID | ✅* | Obrigatório para OWNER e EMPLOYEE |
| `cpf` | string | ✅* | Obrigatório para OWNER e EMPLOYEE. Aceita com ou sem máscara |

**Regras de negócio:**
- `MASTER_ADMIN` não pode ter `barbershopId`
- `OWNER` e `EMPLOYEE` devem ter `barbershopId` e `cpf`
- CPF é validado (algoritmo da Receita Federal) e verificado por duplicidade
- CPF bloqueado por inadimplência impede o cadastro
- E-mail único no sistema

**Resposta 201:**
```json
{
  "success": true,
  "message": "Usuário criado com sucesso",
  "data": {
    "id": "uuid",
    "name": "João Silva",
    "email": "joao@exemplo.com",
    "role": "OWNER",
    "barbershopId": "uuid",
    "cpf": "52998224725",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "active": true
  }
}
```

---

### Barbearias

#### `GET /barbershops`
Lista todas as barbearias.

- **Auth:** Não requerida

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Barbearia do João",
      "whatsapp": "5511999999999",
      "logoUrl": "https://storage.googleapis.com/...",
      "cnpj": "12.345.678/0001-90",
      "address": "Rua das Flores, 123",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "active": true
    }
  ]
}
```

---

#### `GET /barbershops/:id`
Retorna detalhes de uma barbearia específica.

- **Auth:** Não requerida

**Resposta 200:**
```json
{
  "success": true,
  "data": { "id": "uuid", "name": "...", "whatsapp": "...", ... }
}
```

---

#### `POST /barbershops` 🔒 🛡️ `MASTER_ADMIN`
Cria uma nova barbearia.

**Body:**
```json
{
  "name": "Barbearia Nova",
  "whatsapp": "5511999999999",
  "logoUrl": "https://...",
  "cnpj": "12.345.678/0001-90"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | ✅ | Nome da barbearia (2–200 chars) |
| `whatsapp` | string | ✅ | Número WhatsApp (8–20 chars) |
| `logoUrl` | string (URL) | ❌ | URL da logo |
| `cnpj` | string | ❌ | CNPJ (14–18 chars) |

**Resposta 201:**
```json
{ "success": true, "data": { "id": "uuid", "name": "...", ... } }
```

---

#### `PUT /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Atualiza dados da barbearia.

**Body (todos opcionais):**
```json
{
  "name": "Novo Nome",
  "whatsapp": "5511888888888",
  "logoUrl": "https://...",
  "active": true
}
```

---

#### `DELETE /barbershops/:id` 🔒 🛡️ `MASTER_ADMIN`
Desativa (soft delete) uma barbearia.

**Resposta 204:** Sem corpo

---

#### `GET /barbershops/:id/schedule`
Retorna os horários de funcionamento da barbearia.

- **Auth:** Não requerida

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    { "dayOfWeek": 1, "isOpen": true, "openTime": "09:00", "closeTime": "19:00" },
    { "dayOfWeek": 2, "isOpen": true, "openTime": "09:00", "closeTime": "19:00" },
    { "dayOfWeek": 0, "isOpen": false, "openTime": "00:00", "closeTime": "00:00" }
  ]
}
```

> `dayOfWeek`: 0=Domingo, 1=Segunda, ..., 6=Sábado

---

#### `PUT /barbershops/:id/schedule` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Atualiza os horários de funcionamento.

**Body:**
```json
[
  { "dayOfWeek": 1, "isOpen": true, "openTime": "09:00", "closeTime": "19:00" },
  { "dayOfWeek": 2, "isOpen": true, "openTime": "09:00", "closeTime": "19:00" },
  { "dayOfWeek": 0, "isOpen": false, "openTime": "00:00", "closeTime": "00:00" }
]
```

---

#### Logo — Fluxo via Signed URL (recomendado para produção)

**Passo 1:** `GET /barbershops/:id/logo/upload-url?mimeType=image/jpeg` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋

Gera uma URL assinada para upload direto ao GCS.

**Query params:**
- `mimeType` — `image/jpeg`, `image/png` ou `image/webp`

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://storage.googleapis.com/upload/...",
    "publicUrl": "https://storage.googleapis.com/agendai-assets/logos/...",
    "objectName": "logos/barbershop-uuid-timestamp.jpg",
    "expiresInSeconds": 900,
    "instructions": [
      "1. Faça PUT para uploadUrl com o header Content-Type: image/jpeg",
      "2. Após o upload bem-sucedido (HTTP 200), chame PATCH /barbershops/:id/logo com { logoUrl: publicUrl }"
    ]
  }
}
```

**Passo 2:** PUT `{uploadUrl}` — direto no GCS (sem passar pela API)
```
Content-Type: image/jpeg
Body: [arquivo binário]
```

**Passo 3:** `PATCH /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋

Confirma o upload e salva a URL no banco.

**Body:**
```json
{ "logoUrl": "https://storage.googleapis.com/agendai-assets/logos/..." }
```

---

#### Logo — Upload Direto via Multipart (mais simples)

`POST /barbershops/:id/logo/upload` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋

Envia o arquivo diretamente pela API (uma requisição só).

- **Content-Type:** `multipart/form-data`
- **Campo:** `logo` (arquivo JPEG, PNG ou WebP, máx 5 MB)

**Resposta 200:**
```json
{
  "success": true,
  "message": "Logo enviada com sucesso",
  "data": { "id": "uuid", "logoUrl": "https://storage.googleapis.com/..." }
}
```

---

#### `DELETE /barbershops/:id/logo` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋

Remove a logo do GCS e limpa o campo no banco.

**Resposta 204:** Sem corpo

---

### Serviços

#### `GET /services`
Lista serviços. Pode filtrar por barbearia.

- **Auth:** Não requerida

**Query params:**
- `barbershopId` (UUID) — Filtra por barbearia

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "barbershopId": "uuid",
      "name": "Corte Tradicional",
      "price": 35.00,
      "avgTimeMinutes": 30,
      "icon": "scissors",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "active": true
    }
  ]
}
```

---

#### `GET /services/:id`
Retorna um serviço específico.

- **Auth:** Não requerida

---

#### `POST /services` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Cria um novo serviço.

**Body:**
```json
{
  "barbershopId": "uuid-da-barbearia",
  "name": "Corte + Barba",
  "price": 55.00,
  "avgTimeMinutes": 50,
  "icon": "scissors"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `barbershopId` | UUID | ✅ | Barbearia dona do serviço |
| `name` | string | ✅ | Nome do serviço (2–100 chars) |
| `price` | number | ✅ | Preço em reais (>= 0) |
| `avgTimeMinutes` | number | ✅ | Duração média em minutos (>= 1) |
| `icon` | string | ✅ | Identificador do ícone (1–50 chars) |

---

#### `PUT /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Atualiza um serviço.

**Body (todos opcionais):**
```json
{
  "name": "Novo Nome",
  "price": 60.00,
  "avgTimeMinutes": 45,
  "icon": "beard",
  "active": false
}
```

---

#### `DELETE /services/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Desativa um serviço (soft delete).

**Resposta 204:** Sem corpo

---

### Fila (Queue)

#### `POST /queue`
Adiciona um cliente à fila. **Rota pública** — não requer autenticação.

- **Auth:** Opcional (se autenticado, usa o ID do usuário logado; se não, gera UUID anônimo)

**Body:**
```json
{
  "barbershopId": "uuid-da-barbearia",
  "serviceId": "uuid-do-servico",
  "customerName": "Maria Santos",
  "whatsapp": "5511988887777",
  "addedByStaff": false
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `barbershopId` | UUID | ✅ | Barbearia da fila |
| `serviceId` | UUID | ✅ | Serviço desejado |
| `customerName` | string | ✅ | Nome do cliente (2–200 chars) |
| `whatsapp` | string | ✅ | WhatsApp do cliente (8–20 chars) |
| `addedByStaff` | boolean | ❌ | `true` se foi adicionado por um funcionário |

**Resposta 201:**
```json
{
  "id": "uuid",
  "barbershopId": "uuid",
  "serviceId": "uuid",
  "customerId": "uuid",
  "customerName": "Maria Santos",
  "whatsapp": "5511988887777",
  "joinedAt": 1735689600000,
  "status": "waiting",
  "addedByStaff": false,
  "serviceName": "Corte Tradicional"
}
```

> `joinedAt` é um timestamp Unix em milissegundos.

---

#### `GET /queue` 🔒 📋
Lista a fila de atendimento.

**Query params:**
- `barbershopId` (UUID) — Para `MASTER_ADMIN` filtrar por barbearia. `OWNER/EMPLOYEE` usa automaticamente a própria barbearia.

**Resposta 200:**
```json
[
  {
    "id": "uuid",
    "status": "waiting",
    "customerName": "Maria Santos",
    "serviceName": "Corte",
    "joinedAt": 1735689600000,
    "estimatedStartAt": null,
    "completedAt": null,
    "finalPrice": null
  }
]
```

---

#### `PATCH /queue/:id` 🔒 📋
Atualiza o status de um item da fila.

**Body:**
```json
{
  "status": "in_chair",
  "completedBy": "uuid-do-funcionario",
  "finalPrice": 45.00
}
```

| Status | Descrição |
|---|---|
| `waiting` | Aguardando na fila |
| `in_chair` | Em atendimento |
| `completed` | Atendimento concluído |
| `cancelled` | Cancelado |

> `completedBy` e `finalPrice` são usados apenas ao mudar para `completed`.

---

#### `DELETE /queue/:id` 🔒 📋
Remove um item da fila permanentemente.

**Resposta 204:** Sem corpo

---

#### `GET /queue/metrics`
Retorna métricas da fila (contagem de atendimentos concluídos).

- **Auth:** Não requerida

**Query params:**
- `barbershopId` (UUID) — Opcional, filtra por barbearia

**Resposta 200:**
```json
{ "completedCount": 42 }
```

---

### Agendamentos

#### `GET /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Lista agendamentos da barbearia.

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `page` | number | Página (default: 1) |
| `limit` | number | Itens por página (default: 20, máx: 100) |
| `date` | string | Filtrar por data: `YYYY-MM-DD` |
| `status` | enum | `CONFIRMED`, `CANCELLED`, `COMPLETED` |
| `staffId` | UUID | Filtrar por funcionário |
| `search` | string | Busca por nome ou WhatsApp |
| `barbershopId` | UUID | Apenas para `MASTER_ADMIN` |

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "barbershopId": "uuid",
      "serviceId": "uuid",
      "serviceName": "Corte Tradicional",
      "servicePrice": 35.00,
      "staffId": "uuid",
      "staffName": "Carlos",
      "customerName": "Pedro Alves",
      "whatsapp": "5511977776666",
      "date": "2026-07-01T00:00:00.000Z",
      "time": "10:00",
      "status": "CONFIRMED",
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

---

#### `GET /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Retorna um agendamento específico.

---

#### `POST /appointments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Cria um novo agendamento.

**Body:**
```json
{
  "barbershopId": "uuid",
  "serviceId": "uuid",
  "staffId": "uuid",
  "customerName": "Pedro Alves",
  "whatsapp": "5511977776666",
  "date": "2026-07-15",
  "time": "14:30"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `barbershopId` | UUID | ✅ | Barbearia |
| `serviceId` | UUID | ✅ | Serviço |
| `staffId` | UUID | ❌ | Funcionário responsável |
| `customerName` | string | ✅ | Nome do cliente (2–200 chars) |
| `whatsapp` | string | ✅ | WhatsApp (8–20 chars) |
| `date` | string | ✅ | Data no formato `YYYY-MM-DD` |
| `time` | string | ✅ | Horário no formato `HH:MM` |

**Resposta 201:** Agendamento criado com status `CONFIRMED`

---

#### `PATCH /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Atualiza um agendamento. Não é possível editar agendamentos cancelados.

**Body (todos opcionais):**
```json
{
  "staffId": "uuid",
  "customerName": "Novo Nome",
  "whatsapp": "5511999999999",
  "date": "2026-07-20",
  "time": "15:00",
  "status": "COMPLETED"
}
```

---

#### `DELETE /appointments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Cancela um agendamento (status → `CANCELLED`).

**Resposta 204:** Sem corpo

---

### Fiado

Módulo para controle de créditos com clientes (o famoso "anotar na caderneta").

#### `POST /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Registra um novo fiado.

**Body:**
```json
{
  "customerName": "Marcos Oliveira",
  "whatsapp": "5511966665555",
  "description": "Corte + barba — 20/06",
  "amount": 55.00,
  "dueDate": "2026-07-20",
  "notes": "Vai pagar na sexta"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `customerName` | string | ✅ | Nome do cliente devedor (2–200 chars) |
| `whatsapp` | string | ✅ | Contato do cliente (8–20 chars) |
| `description` | string | ✅ | O que foi fiado (2–500 chars) |
| `amount` | number | ✅ | Valor total da dívida em reais (> 0) |
| `dueDate` | date | ❌ | Prazo para pagamento |
| `notes` | string | ❌ | Observações livres |

**Resposta 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "barbershopId": "uuid",
    "customerName": "Marcos Oliveira",
    "whatsapp": "5511966665555",
    "description": "Corte + barba — 20/06",
    "originalAmount": 55.00,
    "paidAmount": 0,
    "remainingAmount": 55.00,
    "status": "PENDING",
    "dueDate": "2026-07-20T00:00:00.000Z",
    "notes": "Vai pagar na sexta",
    "isOverdue": false,
    "payments": [],
    "createdAt": "2026-06-20T00:00:00.000Z",
    "updatedAt": "2026-06-20T00:00:00.000Z"
  }
}
```

---

#### `GET /fiado` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Lista fiados da barbearia.

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `page` | number | Página (default: 1) |
| `limit` | number | Itens por página (default: 20, máx: 100) |
| `status` | enum | `PENDING`, `PARTIAL`, `PAID`, `FORGIVEN` |
| `search` | string | Busca por nome ou WhatsApp |
| `overdue` | boolean | `true` para mostrar apenas vencidos |
| `from` | date | Data de criação mínima |
| `to` | date | Data de criação máxima |

---

#### `GET /fiado/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Retorna um resumo financeiro dos fiados ativos da barbearia.

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "totalDebtors": 5,
    "totalPending": 275.00,
    "totalOriginal": 310.00,
    "totalPaid": 35.00,
    "overdueCount": 2,
    "overdueAmount": 110.00
  }
}
```

---

#### `GET /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Retorna um fiado específico com histórico de pagamentos.

---

#### `PATCH /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Atualiza dados de um fiado.

**Body (todos opcionais):**
```json
{
  "description": "Nova descrição",
  "amount": 60.00,
  "dueDate": "2026-08-01",
  "notes": "Novo prazo combinado",
  "status": "FORGIVEN"
}
```

> Use `status: "FORGIVEN"` para perdoar a dívida manualmente.

---

#### `DELETE /fiado/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Exclui permanentemente um fiado.

**Resposta 204:** Sem corpo

---

#### `POST /fiado/:id/payments` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Registra um pagamento (parcial ou total) de um fiado.

**Body:**
```json
{
  "amount": 30.00,
  "notes": "Pagou metade hoje"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `amount` | number | ✅ | Valor pago (> 0, não pode exceder o saldo devedor) |
| `notes` | string | ❌ | Observação sobre o pagamento |

**Lógica automática:**
- Se `paidAmount + amount >= originalAmount` → status muda para `PAID`
- Caso contrário → status muda para `PARTIAL`

---

### Despesas

Módulo para gestão de despesas operacionais da barbearia.

#### `POST /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Registra uma nova despesa.

**Body:**
```json
{
  "categoryId": "uuid-da-categoria",
  "title": "Compra de shampoo profissional",
  "description": "10 unidades da marca X",
  "amount": 250.00,
  "type": "VARIABLE",
  "recurrence": "ONCE",
  "referenceDate": "2026-06-01",
  "paidAt": "2026-06-05",
  "dueDate": "2026-06-30",
  "paymentMethod": "pix",
  "supplierName": "Distribuidora Silva",
  "receiptUrl": "https://...",
  "notes": "Nota fiscal 1234"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | string | ✅ | Título da despesa (2–200 chars) |
| `amount` | number | ✅ | Valor em reais (> 0) |
| `referenceDate` | date | ✅ | Data de competência |
| `categoryId` | UUID | ❌ | Categoria da despesa |
| `description` | string | ❌ | Descrição detalhada |
| `type` | enum | ❌ | `FIXED`, `VARIABLE`, `INVESTMENT` (default: `VARIABLE`) |
| `recurrence` | enum | ❌ | `ONCE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` (default: `ONCE`) |
| `paidAt` | date | ❌ | Data do pagamento (null = pendente) |
| `dueDate` | date | ❌ | Data de vencimento |
| `paymentMethod` | string | ❌ | Forma de pagamento |
| `supplierName` | string | ❌ | Nome do fornecedor |
| `receiptUrl` | URL | ❌ | URL do comprovante |
| `notes` | string | ❌ | Observações livres |

---

#### `GET /expenses` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Lista despesas com filtros.

**Query params:**

| Param | Tipo | Descrição |
|---|---|---|
| `page` | number | Página (default: 1) |
| `limit` | number | Itens por página (default: 20, máx: 100) |
| `categoryId` | UUID | Filtrar por categoria |
| `type` | enum | `FIXED`, `VARIABLE`, `INVESTMENT` |
| `recurrence` | enum | `ONCE`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` |
| `from` | date | Data de referência mínima |
| `to` | date | Data de referência máxima |
| `paid` | boolean | `true` = só pagas, `false` = só pendentes |
| `search` | string | Busca no título, fornecedor ou notas |

---

#### `GET /expenses/summary` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Retorna resumo financeiro das despesas.

**Query params:** `from` (date), `to` (date)

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "totalAmount": 1500.00,
    "totalPaid": 1200.00,
    "totalPending": 300.00,
    "byCategory": [
      { "categoryId": "uuid", "categoryName": "Produtos", "total": 800.00, "count": 5 }
    ],
    "byType": [
      { "type": "VARIABLE", "total": 1000.00, "count": 8 },
      { "type": "FIXED", "total": 500.00, "count": 2 }
    ],
    "byMonth": [
      { "month": "2026-05", "total": 700.00, "count": 4 },
      { "month": "2026-06", "total": 800.00, "count": 6 }
    ]
  }
}
```

---

#### `GET /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Retorna uma despesa específica.

---

#### `PATCH /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Atualiza uma despesa. Todos os campos são opcionais.

---

#### `DELETE /expenses/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Exclui permanentemente uma despesa.

**Resposta 204:** Sem corpo

---

### Financeiro da Barbearia

Rotas agregadas de visão financeira para owners.

#### `GET /barbershop/financial/summary` 🔒 🛡️ `OWNER` 📋
Resumo financeiro completo (despesas + fiados) da barbearia do usuário.

**Query params:** `from` (date), `to` (date)

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "expenses": {
      "total": 1500.00,
      "totalPaid": 1200.00,
      "totalPending": 300.00,
      "count": 10,
      "byType": [...]
    },
    "fiados": {
      "activeDebtors": 5,
      "totalOriginal": 310.00,
      "totalPaid": 35.00,
      "totalPending": 275.00,
      "overdueCount": 2,
      "overdueAmount": 110.00
    }
  }
}
```

---

#### `GET /barbershop/financial/expenses` 🔒 🛡️ `OWNER` 📋
Lista paginada de despesas da barbearia.

**Query params:** `from`, `to`, `page`, `limit`

---

#### `GET /barbershop/financial/fiados` 🔒 🛡️ `OWNER` 📋
Lista paginada de fiados ativos da barbearia.

**Query params:** `page`, `limit`, `status`

---

### Categorias

#### `GET /service-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Lista categorias de serviços (globais + da barbearia).

---

#### `POST /service-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Cria uma categoria de serviço.

**Body:**
```json
{
  "name": "Cortes",
  "description": "Serviços de corte de cabelo",
  "icon": "scissors",
  "color": "#FF5733"
}
```

---

#### `PATCH /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Atualiza uma categoria de serviço.

---

#### `DELETE /service-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Remove uma categoria de serviço.

**Resposta 204:** Sem corpo

---

#### `GET /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE` 📋
Lista categorias de despesas.

---

#### `POST /expense-categories` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Cria uma categoria de despesa.

**Body:** mesmo formato de service-categories

---

#### `PATCH /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Atualiza uma categoria de despesa.

---

#### `DELETE /expense-categories/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER` 📋
Remove uma categoria de despesa.

---

### Pagamentos

Integração com Mercado Pago.

#### `POST /payments/card` 🔒
Processa um pagamento com cartão de crédito ou débito.

**Body:**
```json
{
  "token": "token-gerado-pelo-mp-js",
  "transactionAmount": 55.00,
  "description": "Corte + Barba",
  "installments": 1,
  "paymentMethodId": "visa",
  "issuerId": "24",
  "payer": {
    "email": "cliente@email.com",
    "identification": { "type": "CPF", "number": "52998224725" },
    "firstName": "João",
    "lastName": "Silva"
  },
  "billingAddress": {
    "zipCode": "01310-100",
    "streetName": "Avenida Paulista",
    "streetNumber": "1000",
    "city": "São Paulo",
    "federalUnit": "SP"
  },
  "barbershopId": "uuid-da-barbearia",
  "serviceId": "uuid-do-servico",
  "appointmentId": "uuid-do-agendamento",
  "queueItemId": "uuid-do-item-da-fila",
  "externalReference": "ref-personalizada"
}
```

**Resposta 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-interno",
    "mpPaymentId": "123456789",
    "status": "approved",
    "statusDetail": "accredited",
    "paymentMethod": "credit_card",
    "transactionAmount": 55.00,
    "currency": "BRL",
    "barbershopId": "uuid",
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
}
```

---

#### `POST /payments/pix` 🔒
Gera um pagamento PIX com QR Code.

**Body:**
```json
{
  "transactionAmount": 55.00,
  "description": "Corte + Barba",
  "payer": {
    "email": "cliente@email.com",
    "firstName": "João",
    "lastName": "Silva",
    "identification": { "type": "CPF", "number": "52998224725" }
  },
  "barbershopId": "uuid-da-barbearia",
  "serviceId": "uuid-do-servico",
  "externalReference": "ref-personalizada",
  "expirationMinutes": 30
}
```

**Resposta 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-interno",
    "mpPaymentId": "987654321",
    "status": "pending",
    "paymentMethod": "pix",
    "transactionAmount": 55.00,
    "pixQrCode": {
      "qrCode": "00020101...",
      "qrCodeBase64": "iVBORw0K...",
      "expirationDate": "2026-06-01T01:00:00.000Z"
    }
  }
}
```

---

#### `GET /payments` 🔒 🛡️ `MASTER_ADMIN, OWNER`
Lista pagamentos.

**Query params:**
- `barbershopId` (UUID) — Apenas `MASTER_ADMIN` pode filtrar por barbearia; `OWNER` vê apenas os seus
- `page` (number) — Default: 1
- `limit` (number) — Default: 20, máx: 100

---

#### `GET /payments/:id` 🔒 🛡️ `MASTER_ADMIN, OWNER, EMPLOYEE`
Consulta status de um pagamento. Se o status for `pending` ou `in_process`, sincroniza automaticamente com o Mercado Pago.

**Query params:**
- `sync=true` — Força sincronização com o MP mesmo para outros status

---

#### `PATCH /payments/:id/cancel` 🔒 🛡️ `MASTER_ADMIN, OWNER`
Cancela um pagamento. Apenas `pending`, `in_process` ou `authorized` podem ser cancelados.

---

#### `POST /payments/webhook`
Endpoint para receber notificações do Mercado Pago. **Não requer autenticação Bearer** (autenticado via HMAC-SHA256).

> Responde imediatamente com `200` e processa de forma assíncrona para evitar timeouts.

---

### Planos

#### `GET /plans`
Lista planos de assinatura disponíveis.

- **Auth:** Não requerida

**Query params:**
- `all=true` — Inclui planos inativos (apenas para uso interno)

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Mensal",
      "description": "Acesso completo com cobrança mensal.",
      "price": 20.00,
      "maxEmployees": 5,
      "features": ["Fila digital ilimitada", "Agendamentos online"],
      "active": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

---

#### `GET /plans/:id`
Retorna um plano específico.

- **Auth:** Não requerida

---

### Assinaturas

#### `POST /subscriptions` 🔒 🛡️ `MASTER_ADMIN, OWNER`
Assina um plano para a barbearia.

**Body com PIX:**
```json
{
  "planId": "uuid-do-plano",
  "paymentMethod": "pix",
  "payerEmail": "dono@barbearia.com",
  "payerFirstName": "João",
  "payerLastName": "Silva",
  "payerIdentification": { "type": "CPF", "number": "52998224725" }
}
```

**Body com Cartão:**
```json
{
  "planId": "uuid-do-plano",
  "paymentMethod": "credit_card",
  "cardToken": "token-do-mp-js",
  "cardPaymentMethodId": "visa",
  "payerEmail": "dono@barbearia.com",
  "payerIdentification": { "type": "CPF", "number": "52998224725" }
}
```

> Para PIX: a assinatura fica `PAST_DUE` até o pagamento ser confirmado via webhook.  
> Para cartão aprovado: ativa imediatamente como `ACTIVE`.

---

#### `GET /subscriptions/me` 🔒
Consulta a assinatura da barbearia do usuário logado. Inclui informações sobre o trial.

**Resposta 200 (sem assinatura, em trial):**
```json
{
  "success": true,
  "data": {
    "subscription": null,
    "trial": {
      "isInTrial": true,
      "trialEndsAt": "2026-07-01T00:00:00.000Z",
      "daysRemainingInTrial": 17,
      "isExpired": false
    }
  }
}
```

**Resposta 200 (com assinatura):**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "id": "uuid",
      "planName": "Mensal",
      "planPrice": 20.00,
      "status": "ACTIVE",
      "startDate": "2026-06-01T00:00:00.000Z",
      "endDate": "2026-07-01T00:00:00.000Z",
      "trialEndsAt": "2026-07-01T00:00:00.000Z",
      "daysRemainingInTrial": null,
      "latestInvoice": { "id": "uuid", "amount": 20.00, "status": "PAID", ... }
    },
    "invoices": [...]
  }
}
```

---

#### `DELETE /subscriptions/me` 🔒 🛡️ `MASTER_ADMIN, OWNER`
Cancela a assinatura da barbearia do usuário logado.

---

---

### Admin — Dashboard

> Todas as rotas de admin requerem 🔒 `MASTER_ADMIN`

#### `GET /admin/dashboard`
Retorna KPIs e dados para o dashboard administrativo.

**Query params:**
- `period` — `day`, `week`, `1m`, `3m`, `6m`, `12m`, `1y`, `2y`, `3y`, `5y` (default: `12m`)

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "periodLabel": "Últimos 12 meses",
    "kpis": {
      "totalBarbershops": 42,
      "activeBarbershops": 38,
      "totalUsers": 120,
      "newInPeriod": 15,
      "growthRate": "+12.5%"
    },
    "chartData": [
      { "label": "Jan/25", "newShops": 3, "appointments": 145, "completedQueue": 280 }
    ],
    "recentBarbershops": [...]
  }
}
```

---

### Admin — Barbearias

#### `GET /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`
Lista todas as barbearias com filtros avançados.

**Query params:**
- `page`, `limit`
- `status` — `active` ou `inactive`
- `search` — Busca por nome, CNPJ ou endereço

---

#### `POST /admin/barbershops` 🔒 🛡️ `MASTER_ADMIN`
Cria uma barbearia já aprovada (bypass do fluxo normal).

**Body:**
```json
{
  "name": "Barbearia Premium",
  "whatsapp": "5511999999999",
  "cnpj": "12.345.678/0001-90",
  "address": "Rua Exemplo, 100, SP",
  "active": true
}
```

---

#### `PATCH /admin/barbershops/:id/status` 🔒 🛡️ `MASTER_ADMIN`
Atualiza o status de aprovação de uma barbearia.

**Body:**
```json
{
  "active": true,
  "approvalStatus": "APPROVED",
  "rejectionReason": "CNPJ inválido"
}
```

| `approvalStatus` | Descrição |
|---|---|
| `PENDING` | Aguardando revisão |
| `APPROVED` | Aprovada |
| `REJECTED` | Rejeitada |

---

### Admin — Usuários

#### `GET /admin/users` 🔒 🛡️ `MASTER_ADMIN`
Lista todos os usuários com filtros.

**Query params:**
- `page`, `limit`
- `role` — `MASTER_ADMIN`, `OWNER`, `EMPLOYEE`
- `active` — `true` ou `false`
- `barbershopId` — Filtra por barbearia
- `search` — Busca por nome ou e-mail

---

#### `POST /admin/users` 🔒 🛡️ `MASTER_ADMIN`
Cria um usuário (sem restrições de role do payload público).

**Body:** mesmo formato do `POST /users` (campos adicionais como `active`)

---

#### `PATCH /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`
Atualiza qualquer campo de um usuário.

**Body (todos opcionais):**
```json
{
  "name": "Novo Nome",
  "email": "novo@email.com",
  "role": "OWNER",
  "active": false,
  "barbershopId": "uuid",
  "cpf": "529.982.247-25"
}
```

> Para remover o `barbershopId`, envie `"barbershopId": "NULL"` (string "NULL") ou `null`.

---

#### `DELETE /admin/users/:id` 🔒 🛡️ `MASTER_ADMIN`
Exclui permanentemente um usuário.

**Resposta 200:** `{ "success": true, "message": "Usuário deletado com sucesso" }`

---

### Admin — Planos

#### `POST /admin/plans` 🔒 🛡️ `MASTER_ADMIN`
Cria um novo plano de assinatura.

**Body:**
```json
{
  "name": "Enterprise",
  "description": "Para grandes barbearias",
  "price": 99.90,
  "maxEmployees": 20,
  "features": ["Fila ilimitada", "Relatórios avançados", "Suporte prioritário"]
}
```

---

#### `PATCH /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`
Atualiza um plano. Todos os campos são opcionais.

---

#### `DELETE /admin/plans/:id` 🔒 🛡️ `MASTER_ADMIN`
Desativa um plano. Assinaturas existentes continuam até vencer.

**Resposta 200:**
```json
{
  "success": true,
  "message": "Plano desativado com sucesso.",
  "data": {
    "activeSubscriptionsRemaining": 3,
    "info": "3 barbearia(s) ainda usam este plano até o vencimento."
  }
}
```

---

### Admin — Assinaturas

#### `GET /admin/subscriptions` 🔒 🛡️ `MASTER_ADMIN`
Lista todas as assinaturas da plataforma.

**Query params:**
- `page`, `limit`
- `status` — `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `UNPAID`
- `search` — Busca por nome ou CNPJ da barbearia

---

#### `GET /admin/subscriptions/:id` 🔒 🛡️ `MASTER_ADMIN`
Consulta a assinatura de uma barbearia específica.

---

#### `DELETE /admin/subscriptions/:barbershopId` 🔒 🛡️ `MASTER_ADMIN`
Cancela a assinatura de uma barbearia específica.

---

### Admin — Financeiro

#### `GET /admin/financial/overview` 🔒 🛡️ `MASTER_ADMIN`
Visão geral financeira de toda a plataforma.

**Resposta 200:**
```json
{
  "success": true,
  "data": {
    "expenses": {
      "thisMonth": 5000.00,
      "allTime": 45000.00,
      "count": 230
    },
    "fiados": {
      "activeDebtors": 48,
      "totalDebtPending": 2350.00,
      "overdueCount": 12,
      "barbershopsWithDebt": 15
    }
  }
}
```

---

#### `GET /admin/financial/summary` 🔒 🛡️ `MASTER_ADMIN`
Resumo financeiro com filtros.

**Query params:**
- `barbershopId` — Filtra por barbearia
- `from` — Data inicial
- `to` — Data final

---

#### `GET /admin/financial/barbershops` 🔒 🛡️ `MASTER_ADMIN`
Lista barbearias com dados financeiros (despesas + fiados).

**Query params:**
- `page`, `limit`
- `sort` — `debt` (ordena por maior dívida) ou `expenses` (ordena por maior despesa)

---

### Admin — Audit Logs

#### `GET /admin/audit-logs` 🔒 🛡️ `MASTER_ADMIN`
Lista logs de auditoria de todas as ações na plataforma.

**Query params:**
- `page`, `limit`
- `userId` — Filtra por usuário
- `resource` — Ex: `User`, `Barbershop`, `Plan`
- `action` — Ex: `CREATE_USER`, `DELETE_USER`

**Resposta 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "action": "CREATE_USER",
      "resource": "User",
      "resourceId": "uuid",
      "details": "{\"name\":\"João\"}",
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "meta": { "total": 150, "page": 1, "limit": 20, "totalPages": 8 }
}
```

---

### Admin — Notificações

#### `GET /admin/notifications` 🔒 🛡️ `MASTER_ADMIN`
Lista notificações do painel admin.

**Query params:**
- `page`, `limit`
- `read` — `true` ou `false`
- `type` — `BLOCK_AUTO`, `UNBLOCK_AUTO`, `UNBLOCK_MANUAL`, `SUBSCRIPTION_EXPIRED`, `PAYMENT_RECEIVED`

---

#### `GET /admin/notifications/unread-count` 🔒 🛡️ `MASTER_ADMIN`
Retorna a contagem de notificações não lidas.

**Resposta 200:**
```json
{ "success": true, "data": { "count": 7 } }
```

---

#### `PATCH /admin/notifications/read-all` 🔒 🛡️ `MASTER_ADMIN`
Marca todas as notificações como lidas.

---

#### `PATCH /admin/notifications/:id/read` 🔒 🛡️ `MASTER_ADMIN`
Marca uma notificação específica como lida.

---

### Admin — Entidades Bloqueadas

#### `GET /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`
Lista CPFs e CNPJs bloqueados.

**Query params:**
- `page`, `limit`
- `type` — `CPF` ou `CNPJ`
- `isActive` — `true` ou `false`
- `search` — Busca por valor ou motivo

---

#### `GET /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`
Retorna um bloqueio específico.

---

#### `POST /admin/blocked-entities` 🔒 🛡️ `MASTER_ADMIN`
Bloqueia manualmente um CPF ou CNPJ.

**Body:**
```json
{
  "type": "CPF",
  "value": "529.982.247-25",
  "reason": "Fraude identificada pelo admin",
  "barbershopId": "uuid-opcional"
}
```

---

#### `DELETE /admin/blocked-entities/:id` 🔒 🛡️ `MASTER_ADMIN`
Desbloqueia uma entidade. Registra quem desbloqueou e cria notificação.

---

## Schemas do Banco de Dados

### Principais entidades

| Entidade | Descrição |
|---|---|
| `User` | Usuários da plataforma (MASTER_ADMIN, OWNER, EMPLOYEE) |
| `Barbershop` | Barbearias cadastradas |
| `Service` | Serviços oferecidos por cada barbearia |
| `Schedule` | Horários de funcionamento por dia da semana |
| `QueueItem` | Itens da fila de atendimento |
| `Appointment` | Agendamentos marcados |
| `Payment` | Pagamentos processados via Mercado Pago |
| `Plan` | Planos de assinatura disponíveis |
| `Subscription` | Assinatura de uma barbearia a um plano |
| `Invoice` | Faturas geradas para cada ciclo de assinatura |
| `Fiado` | Registros de fiado com clientes |
| `FiadoPayment` | Pagamentos parciais de fiado |
| `Expense` | Despesas operacionais da barbearia |
| `ServiceCategory` | Categorias de serviços |
| `ExpenseCategory` | Categorias de despesas |
| `BlockedEntity` | CPFs/CNPJs bloqueados por inadimplência |
| `AdminNotification` | Notificações para o painel admin |
| `AuditLog` | Log de todas as ações realizadas |
| `RefreshToken` | Tokens de refresh armazenados |

---

## Sistema de Assinaturas

### Trial
- Toda barbearia tem 30 dias de trial gratuito a partir da criação
- Durante o trial, todas as funcionalidades estão disponíveis
- Não há necessidade de cartão de crédito para o trial

### Fluxo de assinatura
1. Trial expira → `checkSubscription` retorna 402 com lista de planos
2. Owner faz POST `/subscriptions` escolhendo plano e forma de pagamento
3. **PIX:** Assinatura fica `PAST_DUE` aguardando pagamento → Webhook do MP aprova → status vai para `ACTIVE`
4. **Cartão aprovado:** Assinatura já vai para `ACTIVE` imediatamente

### Status de assinatura

| Status | Acesso | Descrição |
|---|---|---|
| `TRIALING` | ✅ | Em período de trial |
| `ACTIVE` | ✅ | Assinatura ativa e paga |
| `PAST_DUE` | ❌ | Pagamento em atraso |
| `CANCELED` | ❌ | Assinatura cancelada |
| `UNPAID` | ❌ | Inadimplente |

---

## Sistema de Bloqueio de CPF

Quando uma barbearia fica sem assinatura ativa:
1. Os CPFs dos owners são automaticamente bloqueados
2. Ao tentar fazer login, recebem erro 403 com código `CPF_BLOCKED`
3. Ao renovar a assinatura e o pagamento ser aprovado, os CPFs são desbloqueados automaticamente
4. O admin pode bloquear/desbloquear manualmente via `/admin/blocked-entities`

---

## Upload de Logo

Dois fluxos disponíveis:

**Fluxo 1 — Signed URL (recomendado para produção):**
1. `GET /barbershops/:id/logo/upload-url?mimeType=image/jpeg` → obtém URL assinada
2. `PUT {uploadUrl}` com o arquivo (direto ao GCS, sem passar pela API)
3. `PATCH /barbershops/:id/logo` → confirma e salva no banco

**Fluxo 2 — Upload direto via multipart (mais simples para desenvolvimento):**
1. `POST /barbershops/:id/logo/upload` com `Content-Type: multipart/form-data`, campo `logo`

**Restrições:**
- Formatos aceitos: JPEG, PNG, WebP
- Tamanho máximo: 5 MB
- A logo antiga é deletada automaticamente do GCS ao enviar uma nova

---

## Testes

O projeto usa **Vitest** para testes unitários com repositórios mock.

```bash
# Rodar todos os testes
npm test

# Rodar com relatório de cobertura
npm run test:coverage

# Rodar em modo watch
npm run test:watch
```

**Módulos com testes:**
- `appointments` — CRUD, regras de autorização, idempotência
- `barbershops` — CRUD, schedule, erros 404
- `barbershops/uploadLogo` — Signed URL, confirm, delete, erros de autorização
- `expenses` — CRUD, autorização por barbearia
- `fiado` — CRUD, pagamentos parciais, status automático
- `payments` — Cartão, PIX, webhook, cancel, listagem, sincronização com MP
- `queue` — Fila, status, métricas
- `services` — CRUD, ativação/desativação
- `users/createUser` — Validação CPF, email duplicado, roles
- `cpfUtils` — Validação, normalização, mascaramento

---

## Documentação Swagger

A documentação interativa da API está disponível em:

```
http://localhost:3333/docs
```

> O Swagger é gerado automaticamente pelo `@fastify/swagger` + `@fastify/swagger-ui`.

---

## Variáveis de Ambiente — Referência Completa

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string do PostgreSQL |
| `JWT_SECRET` | ✅ | Chave secreta para assinar access tokens |
| `JWT_REFRESH_SECRET` | ✅ | Chave secreta para refresh tokens |
| `JWT_EXPIRES_IN` | ❌ | Expiração do access token (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | Expiração do refresh token (default: `7d`) |
| `PORT` | ❌ | Porta do servidor (default: `3333`) |
| `NODE_ENV` | ❌ | `development` ou `production` |
| `ALLOWED_ORIGINS` | ❌ | Origens CORS permitidas, separadas por vírgula |
| `MERCADOPAGO_ACCESS_TOKEN` | ✅* | Token do Mercado Pago (necessário para pagamentos) |
| `MERCADOPAGO_WEBHOOK_SECRET` | ✅* | Segredo HMAC para validar webhooks do MP |
| `GCS_BUCKET_NAME` | ✅* | Nome do bucket GCS (necessário para upload de logo) |
| `GCS_PROJECT_ID` | ✅* | ID do projeto GCP |
| `GCS_KEY_FILE_PATH` | ❌ | Caminho para JSON da service account |
| `GCS_CREDENTIALS_JSON` | ❌ | JSON da service account (base64 ou string) |
| `GCS_PUBLIC_BASE_URL` | ❌ | URL base pública do GCS (default automático) |

> \* Necessário apenas para o respectivo módulo funcionar (Mercado Pago ou GCS). O servidor sobe sem essas variáveis, mas as rotas correspondentes retornarão erro ao serem chamadas.
