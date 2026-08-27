# 🤖 AI_GUIDE.md — Guia Completo para IAs no Projeto AgendAI

> **Monorepo:** para visão geral frontend + backend, gaps conhecidos e roadmap, leia primeiro [`../AGENTS.md`](../AGENTS.md) na raiz do repositório.
>
> Este documento é o guia **detalhado do backend**. Leia-o **completamente** antes de escrever qualquer linha de código no `agendai-back-end`.

---

## 📋 Índice

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Stack e Versões](#2-stack-e-versões)
3. [Arquitetura e Padrões](#3-arquitetura-e-padrões)
4. [Estrutura de Pastas](#4-estrutura-de-pastas)
5. [Convenções de Código](#5-convenções-de-código)
6. [Sistema de Autenticação e Autorização](#6-sistema-de-autenticação-e-autorização)
7. [Sistema de Assinaturas e Bloqueio de CPF](#7-sistema-de-assinaturas-e-bloqueio-de-cpf)
8. [Banco de Dados e Prisma](#8-banco-de-dados-e-prisma)
9. [Como Criar um Novo Módulo](#9-como-criar-um-novo-módulo)
10. [Como Criar um Novo Endpoint](#10-como-criar-um-novo-endpoint)
11. [Testes](#11-testes)
12. [Erros Comuns e Como Evitá-los](#12-erros-comuns-e-como-evitá-los)
13. [Regras de Negócio Críticas](#13-regras-de-negócio-críticas)
14. [Integrações Externas](#14-integrações-externas)
15. [Checklist antes de Finalizar uma Tarefa](#15-checklist-antes-de-finalizar-uma-tarefa)

---

## 1. Visão Geral do Projeto

**AgendAI** é uma API REST SaaS para gestão de salões, barbearias e studios. Ela serve múltiplos tenants (estabelecimentos) com controle de acesso por role, sistema de assinaturas via AbacatePay/Mercado Pago e fila digital pública.

**Entidades centrais:**
- `Barbershop` — o tenant principal; tudo pertence a uma barbearia
- `User` — pode ser `MASTER_ADMIN` (plataforma), `OWNER` (dono da barbearia) ou `EMPLOYEE`
- `Subscription` — licença de acesso da barbearia à plataforma
- `QueueItem` — fila de atendimento (acesso público)
- `Appointment` — agendamentos
- `SalonClient` — CRM de cliente do salão (sem login)
- `ServicePackage` / `ClientPackage` — catálogo e carteira de pacotes pré-pagos
- `Fiado` — controle de crédito com clientes
- `Expense` — despesas operacionais

---

## 2. Stack e Versões

| Tecnologia | Versão | Observações |
|---|---|---|
| **Node.js** | 22 | LTS obrigatório |
| **TypeScript** | 5.x | `strict` não habilitado, mas evite `any` desnecessário |
| **Fastify** | 4.x | **Não usar Express**. Rotas com `preHandler` array |
| **Prisma** | 7.x | Driver `pg` (não `node-postgres` direto). Adapter `PrismaPg` |
| **PostgreSQL** | 16 | UUID v4 como PK em todos os modelos |
| **Zod** | 3.x | Toda validação de entrada usa Zod |
| **TSyringe** | 4.x | Injeção de dependências com `@inject` e `@injectable` |
| **JWT** | jsonwebtoken 9.x | Access token 15min + Refresh token 7d |
| **Mercado Pago** | SDK v3 + fetch direto | `MercadoPagoService` faz fetch puro (não usa SDK diretamente) |
| **GCS** | @google-cloud/storage 7.x | Upload de logo de barbearia |
| **Vitest** | 4.x | Testes unitários com mock repositories |

---

## 3. Arquitetura e Padrões

### 3.1 Clean Architecture (simplificada)

O projeto segue uma arquitetura em camadas. A ordem de dependência é:

```
HTTP (Routes/Controllers) → UseCases → Repositories (interfaces) ← Repositories (implementações)
```

**Nunca** faça um UseCase importar diretamente `prisma`. UseCases dependem de interfaces (`IXxxRepository`), não de implementações concretas.

### 3.2 Padrão por módulo

Cada módulo em `src/modules/<nome>/` tem estrutura consistente:

```
<módulo>/
  controllers/        ← Lida com HTTP (parse body, chamar UseCase, responder)
  dtos/               ← Interfaces TypeScript de entrada/saída
  infra/
    repositories/     ← Implementação Prisma
      <Módulo>Repository.ts
      mocks/
        Mock<Módulo>Repository.ts   ← Mock para testes
  repositories/
    I<Módulo>Repository.ts          ← Interface
  schemas/            ← Schemas Zod para validação de entrada HTTP
  useCases/           ← Lógica de negócio; injetáveis via TSyringe
```

### 3.3 Injeção de Dependências

Tokens de registro em `src/shared/container/index.ts`. Todo repositório é registrado como **singleton**:

```typescript
container.registerSingleton<IXxxRepository>("XxxRepository", XxxRepository);
```

Nos UseCases, use o decorator corretamente:

```typescript
@injectable()
export class MinhaUseCase {
  constructor(
    @inject("XxxRepository")
    private repo: IXxxRepository
  ) {}
}
```

Nos Controllers, resolva via `container.resolve(MinhaUseCase)`.

### 3.4 Tratamento de Erros

Use **sempre** `AppError` para erros de negócio:

```typescript
import { AppError } from "@/shared/errors/AppError";

throw new AppError("Mensagem para o cliente", 404);
```

O handler global em `app.ts` intercepta `AppError` e retorna `{ success: false, message, errors }`.  
**Nunca** jogue erros nativos (`Error`) para o cliente — eles viram 500.

### 3.5 Resposta HTTP padrão

- Sucesso com dado: `{ success: true, data: ... }`
- Sucesso com paginação: `{ success: true, data: [...], meta: { total, page, limit, totalPages } }`
- Sucesso sem corpo: status `204` sem body
- Criação: status `201`
- Erro: `{ success: false, message: "...", errors?: [...] }`

---

## 4. Estrutura de Pastas

```
src/
├── config/
│   ├── auth.ts              ← Configuração JWT (secret, expiresIn)
│   └── swagger.ts           ← Setup Swagger/OpenAPI
│
├── libs/
│   └── prismaClient.ts      ← Instância singleton do Prisma (SEMPRE importar daqui)
│
├── modules/
│   ├── admin/               ← Dashboard, CRUD admin de barbershops/users/plans
│   ├── appointments/        ← Agendamentos
│   ├── auth/                ← Login, Refresh, Me
│   ├── barbershops/         ← Barbearias, Schedule, Upload Logo
│   ├── expenses/            ← Despesas operacionais
│   ├── fiado/               ← Controle de crédito com clientes
│   ├── payments/            ← Integração Mercado Pago
│   ├── plans/               ← Planos de assinatura
│   ├── queue/               ← Fila de atendimento
│   ├── serviceCategories/   ← Categorias de serviços e despesas
│   ├── services/            ← Serviços das barbearias
│   ├── subscriptions/       ← Assinaturas e webhook de pagamento
│   └── users/               ← Criação de usuários
│
├── shared/
│   ├── constants/
│   │   └── subscriptionMessages.ts   ← Mensagens e config de status de assinatura
│   ├── container/
│   │   ├── index.ts                  ← Registro de todos os repositórios
│   │   └── providers/                ← HashProvider, DateProvider, StorageProvider
│   ├── errors/
│   │   └── AppError.ts
│   ├── infra/http/
│   │   ├── app.ts                    ← buildApp() — Fastify + plugins + error handler
│   │   ├── middlewares/
│   │   │   ├── authenticate.ts       ← Verifica JWT Bearer
│   │   │   ├── authorize.ts          ← Verifica roles permitidas
│   │   │   └── checkSubscription.ts  ← Verifica assinatura ativa da barbearia
│   │   ├── routes/                   ← Um arquivo por grupo de rotas
│   │   └── server.ts                 ← Entry point (bootstrap)
│   ├── services/
│   │   └── blockedEntityService.ts   ← Bloqueio/desbloqueio de CPF/CNPJ
│   └── utils/
│       ├── cpfUtils.ts               ← isValidCpf, normalizeCpf, maskCpf
│       └── zodValidation.ts          ← validateSchema (middleware Zod)
│
prisma/
├── schema.prisma
└── seed.ts
```

---

## 5. Convenções de Código

### 5.1 Importações

Use sempre o alias `@/` para importações absolutas:

```typescript
// ✅ Correto
import { AppError } from "@/shared/errors/AppError";
import { prisma }   from "@/libs/prismaClient";

// ❌ Errado
import { AppError } from "../../../shared/errors/AppError";
```

### 5.2 Nomenclatura

| Elemento | Convenção | Exemplo |
|---|---|---|
| Classes | PascalCase | `CreateExpenseUseCase` |
| Interfaces | PascalCase com `I` | `IExpenseRepository` |
| DTOs | PascalCase com `DTO` | `ICreateExpenseDTO` |
| Arquivos de UseCase | PascalCase | `CreateExpenseUseCase.ts` |
| Arquivos de teste | `*.spec.ts` | `expenses.spec.ts` |
| Tokens de injeção | string igual ao nome da interface sem `I` | `"ExpenseRepository"` |

### 5.3 Tipos

- **Nunca use `any` sem comentário justificando.**
- Prefira tipos explícitos nos retornos de funções públicas.
- BigInt do banco (ex: `mpPaymentId`) deve ser convertido para `string` na saída — nunca para `number` (risco de truncamento acima de `Number.MAX_SAFE_INTEGER`).
- Datas do banco chegam como `Date`; timestamps de fila são `number` (Unix ms).

### 5.4 Async/Await

- Use `async/await` em vez de `.then().catch()` sempre que possível.
- Em operações paralelas independentes, use `Promise.all([...])`.
- Nunca `await` dentro de um `for...of` quando as operações são independentes — prefira `Promise.all(arr.map(...))`.

---

## 6. Sistema de Autenticação e Autorização

### 6.1 Middlewares disponíveis

```typescript
import { authenticate }      from "@/shared/infra/http/middlewares/authenticate";
import { authorize }         from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
```

### 6.2 Combinação padrão de preHandler

```typescript
// Rota pública
app.get("/rota", handler);

// Só autenticado
app.get("/rota", { preHandler: [authenticate] }, handler);

// Autenticado + roles específicas
app.get("/rota", { preHandler: [authenticate, authorize(["OWNER", "MASTER_ADMIN"])] }, handler);

// Autenticado + roles + assinatura ativa
app.get("/rota", {
  preHandler: [authenticate, authorize(["OWNER", "EMPLOYEE"]), checkSubscription]
}, handler);
```

### 6.3 Roles e permissões

| Role | `barbershopId` | Acesso |
|---|---|---|
| `MASTER_ADMIN` | `null` | Tudo. **Isento de checkSubscription.** |
| `OWNER` | UUID da barbearia | Tudo da própria barbearia |
| `EMPLOYEE` | UUID da barbearia | Sem cancelamentos, sem financeiro, sem assinaturas |

### 6.4 Acesso ao usuário no request

Após `authenticate`, `request.user` contém:

```typescript
{
  id: string;          // UUID do usuário
  role: string;        // "MASTER_ADMIN" | "OWNER" | "EMPLOYEE"
  barbershopId?: string;
  cpf?: string;
}
```

### 6.5 Autorização em UseCases

Sempre valide autorização no UseCase (não só na rota):

```typescript
if (
  requestingUser.role !== "MASTER_ADMIN" &&
  entity.barbershopId !== requestingUser.barbershopId
) {
  throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
}
```

### 6.6 Token JWT

O access token carrega `role` e `barbershopId` no payload. O `sub` é o `userId`. **Não confie no barbershopId do body** para determinar a quem o recurso pertence — use `requestingUser.barbershopId`.

---

## 7. Sistema de Assinaturas e Bloqueio de CPF

Esta é a área de lógica mais complexa. Leia com atenção.

### 7.1 Fluxo de acesso

1. Toda barbearia tem **30 dias de trial Pro** a partir de `Barbershop.createdAt` — independente do plano escolhido/assinado. **Não exige cartão.**
2. Durante o trial: `checkDashboardAccess` libera Pro completo mesmo com Essencial; após o trial aplica o plano efetivo (downgrade).
3. Após o trial, é necessária uma `Subscription` `ACTIVE` (ou período pago restante) nas APIs (`checkSubscription` → 402).
4. **Login não 402** quando o trial acaba: emite JWT para o dono poder `POST /subscriptions`. CPF só é bloqueado em inadimplência real (`PAST_DUE` / `UNPAID`).
5. `MASTER_ADMIN` é **sempre isento** de `checkSubscription`.

### 7.2 Status de Subscription

```
TRIALING  → acesso OK
ACTIVE    → acesso OK
PAST_DUE  → acesso BLOQUEADO (402)
CANCELED  → acesso BLOQUEADO (402)
UNPAID    → acesso BLOQUEADO (402)
```

### 7.3 Resposta 402 padronizada

Quando o acesso é negado por falta de assinatura, a resposta é sempre:

```json
{
  "success": false,
  "message": "{\"code\":\"SUBSCRIPTION_REQUIRED\",\"message\":\"...\",\"plans\":[...],\"barbershopId\":\"...\"}"
}
```

O `message` é um JSON stringificado. O frontend deve fazer `JSON.parse(error.message)` para ler `code` e `plans`.

### 7.4 Bloqueio automático de CPF

Quando uma assinatura fica inadimplente (`PAST_DUE` / `UNPAID`):
1. O sistema chama `blockOwnerCpfs(barbershopId)`.
2. Os CPFs dos `OWNER`s dessa barbearia são inseridos em `BlockedEntity` com `isActive: true`.
3. No login, `assertCpfNotBlocked(cpf)` é chamado e retorna 403 com `code: "CPF_BLOCKED"`.
4. No webhook de pagamento aprovado, `unblockOwnerCpfs(barbershopId, ...)` é chamado.

O fim do trial **sem pagamento** gera 402 nas APIs operacionais, mas **não** bloqueia CPF (o dono precisa autenticar para assinar).

### 7.5 Serviço de bloqueio

```typescript
import { blockEntity, unblockEntity, assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
```

- `blockEntity({ type, value, reason, barbershopId, blockedBy, idempotent })` — cria bloqueio
- `unblockEntity({ type, value, unblockedBy })` — remove bloqueio
- `assertCpfNotBlocked(cpf)` — lança 403 se bloqueado

O `blockedBy` e `unblockedBy` devem ser `"system"` para ações automáticas ou o `userId` para ações manuais do admin. O UUID `00000000-0000-0000-0000-000000000000` é o usuário-sistema do seed, usado em audit logs automáticos.

---

## 8. Banco de Dados e Prisma

### 8.1 Instância do Prisma

**Sempre importe de `@/libs/prismaClient`**, nunca instancie um novo `PrismaClient`:

```typescript
import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@/libs/prismaClient"; // para tipos Prisma
```

O Prisma usa o driver `PrismaPg` (pool de conexões via `pg`). **Nunca** instancie `new PrismaClient()` em módulos avulsos — exceto no seed, que tem sua própria instância justificada.

### 8.2 UUIDs

Todos os modelos usam `@id @default(uuid()) @db.Uuid`. O Prisma gera automaticamente ao criar.

### 8.3 Soft delete vs hard delete

| Entidade | Estratégia |
|---|---|
| `Barbershop` | Soft delete (`active: false`) |
| `User` | Soft delete (`active: false`) |
| `Service` | Soft delete (`active: false`) |
| `Plan` | Soft delete (`active: false`) |
| `Appointment` | Soft delete (status `CANCELLED`) |
| `QueueItem` | Hard delete (após cancelamento manual) |
| `Fiado`, `Expense`, `FiadoPayment` | Hard delete |

### 8.4 Enum mapping

O banco usa enums em UPPER_CASE (`WAITING`, `IN_CHAIR`, etc.). A API retorna lowercase (`waiting`, `in_chair`). O mapeamento fica no repositório:

```typescript
function toDTO(s: PrismaQueueStatus): QueueStatus {
  return s.toLowerCase() as QueueStatus;
}
```

Mantenha esse padrão para qualquer novo enum que exija apresentação diferente da armazenada.

### 8.5 Migrations vs db push

- Em desenvolvimento/Docker: use `npx prisma db push` (sem migration files).
- Em produção: use `prisma migrate deploy` com migration files geradas por `prisma migrate dev`.
- **Nunca edite o schema e rode `db push` em produção sem backup.**

### 8.6 BigInt

`Payment.mpPaymentId` é `BigInt` no banco. Ao serializar para JSON:

```typescript
// ✅ Correto — converte para string
mpPaymentId: record.mpPaymentId.toString()

// ❌ Errado — trunca silenciosamente IDs grandes
mpPaymentId: Number(record.mpPaymentId)
```

---

## 9. Como Criar um Novo Módulo

Siga rigorosamente a estrutura existente. Exemplo: criar módulo `reviews`.

### Passo 1 — DTOs

Crie `src/modules/reviews/dtos/IReviewDTO.ts`:

```typescript
export interface ICreateReviewDTO {
  barbershopId: string;
  customerId: string;
  rating: number;
  comment?: string;
}

export interface IReviewResponseDTO {
  id: string;
  barbershopId: string;
  customerId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}
```

### Passo 2 — Interface do Repositório

Crie `src/modules/reviews/repositories/IReviewRepository.ts`:

```typescript
import { ICreateReviewDTO, IReviewResponseDTO } from "../dtos/IReviewDTO";

export interface IReviewRepository {
  create(data: ICreateReviewDTO): Promise<IReviewResponseDTO>;
  findById(id: string): Promise<IReviewResponseDTO | null>;
  // ...
}
```

### Passo 3 — Mock Repository (para testes)

Crie `src/modules/reviews/infra/repositories/mocks/MockReviewRepository.ts` implementando `IReviewRepository` com arrays em memória.

### Passo 4 — Implementação Prisma

Crie `src/modules/reviews/infra/repositories/ReviewRepository.ts` usando `prisma` de `@/libs/prismaClient`.

### Passo 5 — Schemas Zod

Crie `src/modules/reviews/schemas/reviewSchemas.ts`.

### Passo 6 — UseCases

Crie `src/modules/reviews/useCases/reviewUseCases.ts` com todas as classes `@injectable`.

### Passo 7 — Controller

Crie `src/modules/reviews/controllers/ReviewController.ts`. O controller resolve UseCases via `container.resolve(...)`.

### Passo 8 — Registrar no Container

Em `src/shared/container/index.ts`, adicione:

```typescript
import { IReviewRepository } from "@/modules/reviews/repositories/IReviewRepository";
import { ReviewRepository }  from "@/modules/reviews/infra/repositories/ReviewRepository";

container.registerSingleton<IReviewRepository>("ReviewRepository", ReviewRepository);
```

### Passo 9 — Rotas

Crie `src/shared/infra/http/routes/reviews.routes.ts` e importe em `src/shared/infra/http/routes/api.ts`.

### Passo 10 — Schema Prisma

Adicione o model ao `prisma/schema.prisma` e rode `npx prisma db push`.

---

## 10. Como Criar um Novo Endpoint

### Exemplo completo — `GET /reviews`

**1. Rota** (`reviews.routes.ts`):

```typescript
import { FastifyInstance } from "fastify";
import { authenticate }      from "../middlewares/authenticate";
import { authorize }         from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { ReviewController }  from "@/modules/reviews/controllers/ReviewController";

export async function reviewsRoutes(app: FastifyInstance) {
  const reviews = new ReviewController();

  app.get("/reviews", {
    preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]), checkSubscription]
  }, reviews.list.bind(reviews));
}
```

**2. Controller**:

```typescript
async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user!;
  const { page = "1", limit = "20" } = request.query as any;

  const barbershopId = user.role === "MASTER_ADMIN"
    ? (request.query as any).barbershopId ?? ""
    : user.barbershopId ?? "";

  if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

  const useCase = container.resolve(ListReviewsUseCase);
  const result  = await useCase.execute(barbershopId, user, Number(page), Number(limit));

  reply.send({
    success: true,
    data: result.data,
    meta: {
      total:      result.total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(result.total / Number(limit)),
    },
  });
}
```

**3. UseCase**:

```typescript
@injectable()
export class ListReviewsUseCase {
  constructor(
    @inject("ReviewRepository")
    private repo: IReviewRepository
  ) {}

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string },
    page: number,
    limit: number
  ) {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.list(barbershopId, page, limit);
  }
}
```

---

## 11. Testes

### 11.1 Configuração

- Framework: **Vitest**
- Setup global: `src/tests/setup.ts` (importa `reflect-metadata`)
- Configuração em `vitest.config.ts` (deve ter `setupFiles: ["src/tests/setup.ts"]`)

### 11.2 Padrão de teste

Todos os testes usam **Mock Repositories** — nunca se conectam ao banco real.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MockReviewRepository } from "@/.../mocks/MockReviewRepository";
import { CreateReviewUseCase }  from "./reviewUseCases";
import { AppError }             from "@/shared/errors/AppError";

let repo: MockReviewRepository;
let useCase: CreateReviewUseCase;

beforeEach(() => {
  repo    = new MockReviewRepository();
  useCase = new CreateReviewUseCase(repo as any);
});

describe("CreateReviewUseCase", () => {
  it("cria review com sucesso", async () => {
    const review = await useCase.execute({ ... }, adminUser);
    expect(review.id).toBeDefined();
  });

  it("lança 403 quando OWNER acessa outra barbearia", async () => {
    await expect(
      useCase.execute({ barbershopId: "outro-shop" }, ownerUser)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
```

### 11.3 Executar testes

```bash
npm test                # todos
npm run test:watch      # modo watch
npm run test:coverage   # com relatório de cobertura
```

### 11.4 O que deve ser testado

Para cada UseCase, teste obrigatoriamente:
- ✅ Caminho feliz (criação, listagem, atualização, etc.)
- ✅ `404` quando entidade não existe
- ✅ `403` quando OWNER tenta acessar outra barbearia
- ✅ `403` quando EMPLOYEE tenta operação proibida (ex: cancelar)
- ✅ Regras de negócio específicas (ex: não editar agendamento cancelado)
- ✅ Idempotência quando aplicável

---

## 12. Erros Comuns e Como Evitá-los

### ❌ Instanciar Prisma fora de `prismaClient.ts`

```typescript
// ❌ Errado
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ✅ Correto
import { prisma } from "@/libs/prismaClient";
```

### ❌ Importar tipos Prisma do pacote diretamente

```typescript
// ❌ Potencialmente problemático com o adapter
import { Prisma } from "@prisma/client";

// ✅ Correto
import { Prisma } from "@/libs/prismaClient";
```

### ❌ Converter BigInt para Number

```typescript
// ❌ Errado
mpPaymentId: Number(record.mpPaymentId)

// ✅ Correto
mpPaymentId: record.mpPaymentId.toString()
```

### ❌ Passar string de token JWT diretamente em `expiresIn`

```typescript
// ❌ Pode causar erro de tipo
sign(payload, secret, { expiresIn: auth.expiresIn })

// ✅ Cast necessário por limitação de tipos do pacote
sign(payload, secret, { expiresIn: auth.expiresIn as any })
```

### ❌ Usar `Number()` para passar mpPaymentId ao Mercado Pago

```typescript
// ❌ Errado — trunca o ID
this.mpService.cancelPayment(Number(payment.mpPaymentId))

// ✅ Correto — passa string diretamente
this.mpService.cancelPayment(payment.mpPaymentId)
```

### ❌ Usar `z.number().multipleOf(0.01)` para validar valores monetários

```typescript
// ❌ Errado — falha para 49.99 por imprecisão de ponto flutuante
z.number().multipleOf(0.01)

// ✅ Correto — usa refine com Math.round
z.number().positive().refine(
  v => Math.round(v * 100) / 100 === v,
  { message: "Máximo 2 casas decimais" }
)
```

### ❌ Esquecer `reflect-metadata` no setup de testes

O TSyringe exige `reflect-metadata` importado antes de qualquer decorator. O arquivo `src/tests/setup.ts` faz isso; garanta que o `vitest.config.ts` o referencie.

### ❌ Não registrar rota no `api.ts`

Ao criar um novo arquivo de rotas, lembre de importar e chamar a função no `src/shared/infra/http/routes/api.ts`.

### ❌ Esquecer de registrar o repositório no container

Após criar um repositório, registrá-lo em `src/shared/container/index.ts` é obrigatório.

---

## 13. Regras de Negócio Críticas

### 13.1 Fila (Queue)

- `POST /queue` é **público** — qualquer pessoa pode entrar na fila sem conta.
- O `customerId` **nunca** vem do body — é gerado server-side (UUID aleatório) ou extraído do JWT se autenticado. Isso previne forjamento de identidade.
- Transição de status: `waiting → in_chair → completed | cancelled`.

### 13.2 Fiado

- Um fiado fechado (`PAID` ou `FORGIVEN`) não pode receber novos pagamentos.
- Pagamento não pode exceder `remainingAmount`.
- Status progride automaticamente: `PENDING → PARTIAL → PAID`.
- `FORGIVEN` é configurado manualmente via PATCH com `{ status: "FORGIVEN" }`.

### 13.3 Agendamentos

- Agendamentos `CANCELLED` não podem ser editados.
- Apenas `OWNER` e `MASTER_ADMIN` podem cancelar (fazer DELETE que na verdade seta `CANCELLED`).

### 13.4 Usuários

- `MASTER_ADMIN` não pode ter `barbershopId`.
- `OWNER` e `EMPLOYEE` **devem** ter `barbershopId` e `cpf`.
- CPF é validado pelo algoritmo da Receita Federal antes do cadastro.
- CPF bloqueado impede cadastro e login.

### 13.5 Barbearias

- Ao criar uma barbearia com CNPJ já cadastrado, verifica-se se a barbearia existente tem assinatura ativa. Se não tiver, retorna 402.
- Logo é armazenada no Google Cloud Storage. Ao trocar a logo, a antiga é deletada do GCS automaticamente.
- Upload de logo tem dois fluxos: Signed URL (cliente → GCS direto) e Multipart (cliente → API → GCS). Ambos têm limite de 5 MB e aceitam JPEG, PNG, WebP.

### 13.6 Pagamentos

- PIX: assinatura fica `PAST_DUE` até o webhook confirmar o pagamento.
- Cartão aprovado: assinatura ativa imediatamente.
- O webhook valida assinatura HMAC-SHA256. Em produção, `MERCADOPAGO_WEBHOOK_SECRET` é obrigatório.
- `processWebhook` responde 200 imediatamente e processa de forma assíncrona.

### 13.7 CPF no JWT

O CPF do usuário é incluído no access token para permitir que `checkSubscription` valide o bloqueio a cada request, sem query adicional ao banco de usuários.

---

## 14. Integrações Externas

### 14.0 E-mail (Resend) + Indicação

- Provider DI: `EmailProvider` → `ResendEmailProvider` (sem `RESEND_API_KEY` = log/skip).
- Fila BullMQ `email` (`enqueueEmail`) — worker iniciado em `server.ts`.
- Templates em `modules/email/templates/` (boas-vindas, indicação aplicada, indicação convertida).
- Indicação dono→dono: `ReferralCode` / `Referral`; `POST /auth/register` aceita `referralCode`; `GET /api/referrals/me` para o owner.
- Qualificação + recompensa (+30 dias no `endDate` do indicador) em `handleSubscriptionPaymentWebhook` / pagamento MP aprovado.
- Log de envios: tabela `EmailDelivery`.
- Termos/LGPD: fora de escopo técnico — agente legal separado.

### 14.1 Mercado Pago

Arquivo: `src/modules/payments/services/MercadoPagoService.ts`

- Usa `fetch` nativo do Node 22 — não usa o SDK do MP diretamente.
- `MERCADOPAGO_ACCESS_TOKEN` é lido de forma **lazy** (não no construtor) para permitir que o servidor suba sem a variável definida.
- Chave de idempotência (`X-Idempotency-Key`) é gerada automaticamente para criar pagamentos.
- **Nunca** passe `Number(mpPaymentId)` para métodos do serviço — sempre `string`.

### 14.2 Google Cloud Storage

Arquivo: `src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts`

**Setup (bucket + SA + chave):** siga [`docs/GCS_SETUP.md`](docs/GCS_SETUP.md).

- `Storage` é inicializado de forma **lazy**.
- Aceita credenciais via arquivo (`GCS_KEY_FILE_PATH`), JSON/base64 (`GCS_CREDENTIALS_JSON`) ou ADC.
- Placeholder / JSON sem `type: service_account` → `AppError` 503 com ponteiro para `docs/GCS_SETUP.md` (a API sobe; só falha no upload).
- Scripts: `create-service-account.sh`, `setup-gcs.sh`, `ensure-gcs-key.sh`. CORS do bucket vem de `cors.json`.

### 14.3 Variáveis de Ambiente Obrigatórias em Produção

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_WEBHOOK_SECRET
GCS_BUCKET_NAME
GCS_PROJECT_ID
GCS_KEY_FILE_PATH  (ou GCS_CREDENTIALS_JSON)
```

---

## 15. Checklist antes de Finalizar uma Tarefa

Antes de considerar uma tarefa concluída, verifique:

- [ ] **Arquitetura:** O novo código segue o padrão Controller → UseCase → Repository?
- [ ] **Interface:** Existe uma interface `I<Xxx>Repository` para o novo repositório?
- [ ] **Mock:** Existe um `Mock<Xxx>Repository` para testes?
- [ ] **Container:** O repositório foi registrado em `src/shared/container/index.ts`?
- [ ] **Rotas:** A função de rotas foi importada em `src/shared/infra/http/routes/api.ts`?
- [ ] **Autorização:** UseCases validam `barbershopId` do `requestingUser`?
- [ ] **MASTER_ADMIN:** O MASTER_ADMIN é isento de restrições de `barbershopId`?
- [ ] **checkSubscription:** Rotas operacionais de barbearia têm `checkSubscription` no `preHandler`?
- [ ] **AppError:** Erros de negócio usam `AppError` (não `Error` nativo)?
- [ ] **BigInt:** `mpPaymentId` e similares são serializados como `string`?
- [ ] **Testes:** Há testes para o caminho feliz e para 403/404?
- [ ] **Prisma:** Nenhum UseCase importa `prisma` diretamente (só por repositório)?
- [ ] **Seed:** Se o novo model precisar de dados iniciais, o seed foi atualizado?
- [ ] **Resposta HTTP:** Sucesso retorna `{ success: true, data }` e criação usa status `201`?
- [ ] **Paginação:** Endpoints de listagem retornam `meta: { total, page, limit, totalPages }`?

---

## Apêndice A — Mapa de Tokens de Injeção

| Token (string) | Interface | Implementação |
|---|---|---|
| `"UserRepository"` | `IUserRepository` | `UserRepository` |
| `"ServiceRepository"` | `IServiceRepository` | `ServiceRepository` |
| `"BarbershopRepository"` | `IBarbershopRepository` | `BarbershopRepository` |
| `"QueueRepository"` | `IQueueRepository` | `QueueRepository` |
| `"PaymentRepository"` | `IPaymentRepository` | `PaymentRepository` |
| `"MercadoPagoService"` | — | `MercadoPagoService` |
| `"PlanRepository"` | `IPlanRepository` | `PlanRepository` |
| `"FiadoRepository"` | `IFiadoRepository` | `FiadoRepository` |
| `"ExpenseRepository"` | `IExpenseRepository` | `ExpenseRepository` |
| `"ServiceCategoryRepository"` | `IServiceCategoryRepository` | `ServiceCategoryRepository` |
| `"ExpenseCategoryRepository"` | `IExpenseCategoryRepository` | `ExpenseCategoryRepository` |
| `"AppointmentRepository"` | `IAppointmentRepository` | `AppointmentRepository` |
| `"HashProvider"` | `IHashProvider` | `BcryptHashProvider` |
| `"DateProvider"` | `IDateProvider` | `DayjsDateProvider` |
| `"StorageProvider"` | `IStorageProvider` | `GcsStorageProvider` |

---

## Apêndice B — Endpoints por Role

### MASTER_ADMIN only
- `POST /barbershops`, `DELETE /barbershops/:id`
- `POST /admin/barbershops`, `PATCH /admin/barbershops/:id/status`
- `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id`
- `POST /admin/plans`, `PATCH /admin/plans/:id`, `DELETE /admin/plans/:id`
- `GET /admin/subscriptions`, `DELETE /admin/subscriptions/:barbershopId`
- `GET /admin/dashboard`, `GET /admin/financial/*`
- `GET /admin/audit-logs`, `GET/PATCH /admin/notifications/*`
- `GET/POST/DELETE /admin/blocked-entities`

### OWNER + MASTER_ADMIN
- `PUT /barbershops/:id`, `PUT /barbershops/:id/schedule`
- `POST /services`, `PUT /services/:id`, `DELETE /services/:id`
- `DELETE /appointments/:id`
- `DELETE /fiado/:id`
- `DELETE /expenses/:id`
- `GET /payments`, `PATCH /payments/:id/cancel`
- `POST /subscriptions`, `DELETE /subscriptions/me`
- Logo: `GET /barbershops/:id/logo/upload-url`, `PATCH /barbershops/:id/logo`, `POST /barbershops/:id/logo/upload`, `DELETE /barbershops/:id/logo`

### OWNER + EMPLOYEE + MASTER_ADMIN
- `GET /queue`, `PATCH /queue/:id`, `DELETE /queue/:id`
- `GET /appointments`, `POST /appointments`, `PATCH /appointments/:id`
- `GET /fiado/*`, `POST /fiado`, `PATCH /fiado/:id`, `POST /fiado/:id/payments`
- `GET /expenses/*`, `POST /expenses`, `PATCH /expenses/:id`
- `GET /service-categories/*`, `GET /expense-categories/*`
- `GET /payments/:id`

### OWNER only
- `GET /barbershop/financial/*`

### Público (sem autenticação)
- `GET /health`
- `POST /auth/login`, `POST /auth/refresh`
- `POST /users`
- `GET /barbershops`, `GET /barbershops/:id`, `GET /barbershops/:id/schedule`
- `GET /services`, `GET /services/:id`
- `POST /queue`, `GET /queue/metrics`
- `GET /plans`, `GET /plans/:id`
- `POST /payments/webhook`

---

*Última atualização: gerado automaticamente com base no estado atual do repositório.*
