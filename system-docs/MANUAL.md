# AgendAI Back‑end — Manual do Sistema

Este manual documenta a arquitetura, a estrutura de pastas, os padrões e o fluxo das requisições do back‑end do AgendAI. Ele serve tanto para onboard de novos(as) desenvolvedores(as) quanto para agentes de IA que precisem navegar e estender o projeto com segurança.

## Visão Geral

- Plataforma: Node.js 22, TypeScript, Fastify 4.
- Persistência: PostgreSQL via Prisma (driver adapter `@prisma/adapter-pg`).
- Execução: Docker Compose (PostgreSQL + API) com hot‑reload via `tsx watch`.
- Padrões: Arquitetura por módulos de domínio, com camadas claras:
  - Rotas (Fastify) → Controllers → UseCases → Repositórios → Prisma → Banco.
- Validação: Zod (via `validateSchema` como `preHandler`).
- Injeção de dependências: `tsyringe` com registros em `shared/container`.
- Autenticação/autorização: JWT, middlewares `authenticate` e `authorize`.

## Estrutura de Pastas (alto nível)

```
src/
├─ config/                  # Configurações (auth, swagger)
├─ libs/                    # Adaptações e clientes (ex.: prismaClient)
├─ modules/                 # Módulos de domínio
│  ├─ auth/
│  ├─ users/
│  ├─ services/
│  ├─ barbershops/
│  └─ queue/
├─ shared/
│  ├─ container/            # Registro de providers e repositórios
│  ├─ errors/               # Exceções (AppError)
│  └─ infra/http/           # App, server, middlewares e rotas
└─ tests/                   # Configuração de testes (Vitest)

prisma/
├─ schema.prisma            # Modelo de dados
└─ seed.ts                  # Seed da base

Dockerfile                  # Imagem da API
docker-compose.yml          # Orquestração (API + Postgres)
```

### Estrutura por Módulo

Cada módulo em `src/modules/<domínio>` segue um padrão consistente:

- `dtos/` — contratos de entrada/saída (ex.: `ICreateXDTO`, `IXResponseDTO`).
- `repositories/` — interfaces (`I...Repository`) que definem portas da aplicação.
- `infra/repositories/` — implementações (ex.: `Prisma`) das interfaces.
- `schemas/` — validações Zod para entrada de dados.
- `useCases/` — casos de uso com regras de negócio; cada caso tem controller próprio.

Exemplo de fluxo:

```
Route → preHandlers (ex.: validateSchema) → Controller → UseCase → Repository → prisma → DB
```

## Principais Componentes

- App e servidor
  - `shared/infra/http/app.ts` cria a instância Fastify, registra rotas e o tratador global de erros.
  - `shared/infra/http/server.ts` inicializa DI (`shared/container`), sobe o app e escuta a porta.
- Rotas
  - `shared/infra/http/routes/*.ts` expõe endpoints por domínio e agrupa sob `/api` via `api.ts`.
  - Exemplo de health‑check em `/health`.
- Middlewares
  - `authenticate` lê e valida Bearer JWT, injeta `request.user`.
  - `authorize(allowedRoles)` bloqueia acesso quando o `role` não está permitido.
- Validação
  - `shared/utils/zodValidation.ts` permite usar Zod como `preHandler` nas rotas.
- Erros
  - `shared/errors/AppError` carrega `statusCode` e `errors` detalhados; tratado globalmente no `app.ts`.
- Injeção de dependências
  - `shared/container/index.ts` registra implementações de repositórios.
  - `shared/container/providers/index.ts` registra providers utilitários (hash, datas).

## Banco de Dados (Prisma)

Entities principais em `prisma/schema.prisma`:

- `User` com `Role` (`ADMIN`, `OWNER`, `EMPLOYEE`), senha hash, vínculo opcional à `Barbershop`.
- `RefreshToken` para fluxo de refresh JWT.
- `Barbershop` com `Schedule`, `Service`, `QueueItem`, `Appointment`, `FeedPost`.
- `Service` com preço, tempo médio e ícone.
- `QueueItem` com estado (`WAITING`, `IN_CHAIR`, `COMPLETED`, `CANCELLED`), timestamps e referências.
- `Appointment` com status (`CONFIRMED`, `CANCELLED`, `COMPLETED`).
- `FeedPost` para conteúdo do feed.

Cliente Prisma: `src/libs/prismaClient.ts` usa pool do `pg` + `PrismaPg` adapter.

Regras específicas de domínio (Users):
- Apenas `ADMIN` não possui `barbershopId` vinculado.
- `OWNER` e `EMPLOYEE` devem possuir `barbershopId` obrigatório.
- A validação é aplicada via Zod em `createUserSchema`/`updateUserSchema` e reforçada no `CreateUserUseCase`.

## Autenticação e Autorização

- Endpoints principais:
  - `POST /auth/login` → emite tokens.
  - `POST /auth/refresh` → renova access token usando refresh token válido.
  - `GET /auth/me` → retorna dados do usuário autenticado.
- Configurações em `src/config/auth.ts`: segredos e tempos de expiração via variáveis de ambiente.
- Proteção de rotas: adicione `authenticate` e, se necessário, `authorize(["ROLE"])` no `preHandler`.

## Swagger (documentação da API)

Há suporte a Swagger via `src/config/swagger.ts`. Para habilitar:

1. Em `src/shared/infra/http/app.ts`, descomente a importação e a chamada `setupSwagger(app)`.
2. Acesse a UI em `/docs`. Tags e esquemas de segurança (Bearer JWT) já configurados.

## Execução e Desenvolvimento

### Com Docker

1. Configure `.env` conforme necessário (veja seção abaixo).
2. Suba os serviços:

```bash
docker-compose up --build
```

- O volume `.:/app` permite hot‑reload; salvar arquivos reinicia o servidor (`tsx watch`).
- O Compose executa `prisma generate`, `db push`, `prisma:seed` e `dev:docker` automaticamente.

### Sem Docker (local)

1. Instale dependências:

```bash
npm install
```

2. Gere cliente e prepare DB (com Postgres rodando e `DATABASE_URL` configurada):

```bash
npx prisma generate
npx prisma db push
npm run prisma:seed
```

3. Rode em desenvolvimento:

```bash
npm run dev
```

## Variáveis de Ambiente (principais)

- `DATABASE_URL` — string de conexão do Postgres.
- `JWT_SECRET` — segredo para access token.
- `JWT_REFRESH_SECRET` — segredo para refresh token.
- `JWT_EXPIRES_IN` — ex.: `15m`.
- `JWT_REFRESH_EXPIRES_IN` — ex.: `7d`.
- `PORT` — porta do servidor (padrão 3333).
- `ALLOWED_ORIGINS` — lista separada por vírgulas (se CORS for habilitado).

No Docker Compose, alguns valores já estão definidos para desenvolvimento.

## Testes

- Framework: Vitest.
- Scripts:
  - `npm test` — roda a suíte.
  - `npm run test:watch` — modo watch.
  - `npm run test:coverage` — cobertura.
- Mocks de repositórios ficam em `infra/repositories/mocks` dentro de cada módulo.

### Testes Unitários

- Objetivo: isolar regras de negócio em `UseCases` sem acessar banco ou rede.
- Estratégia: instanciar o `UseCase` com repositórios e providers mockados e validar cenários de sucesso/erro.
- Exemplo (baseado em `CreateUserUseCase.spec.ts`):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { CreateUserUseCase } from "@/modules/users/useCases/createUser/CreateUserUseCase";
import { MockUserRepository } from "@/modules/users/infra/repositories/mocks/MockUserRepository";
import { MockHashProvider } from "@/shared/container/providers/HashProvider/mocks/MockHashProvider";
import { AppError } from "@/shared/errors/AppError";

let useCase: CreateUserUseCase;
let users: MockUserRepository;
let hash: MockHashProvider;

beforeEach(() => {
  users = new MockUserRepository();
  hash = new MockHashProvider();
  useCase = new CreateUserUseCase(users as any, hash as any);
});

describe("CreateUserUseCase", () => {
  it("cria usuário e hash da senha", async () => {
    const user = await useCase.execute({ name: "John", email: "john@example.com", password: "123456" });
    expect(user.id).toBeDefined();
  });

  it("não permite e-mail duplicado", async () => {
    await useCase.execute({ name: "John", email: "john@example.com", password: "123456" });
    await expect(
      useCase.execute({ name: "Jane", email: "john@example.com", password: "abcdef" })
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- Convenções:
  - Nome de arquivo: `*.spec.ts` próximo ao código testado (ex.: em `modules/.../useCases`).
  - Use `beforeEach` para reinicializar mocks e manter isolamento entre testes.
  - Para erros de negócio, use `rejects.toBeInstanceOf(AppError)`.

Referências úteis:
- Unitários por domínio: [barbershops.spec.ts](file:///d:/Programação/agendai-back-end/src/modules/barbershops/useCases/barbershops.spec.ts), [services.spec.ts](file:///d:/Programação/agendai-back-end/src/modules/services/useCases/services.spec.ts), [queue.spec.ts](file:///d:/Programação/agendai-back-end/src/modules/queue/useCases/queue.spec.ts), [CreateUserUseCase.spec.ts](file:///d:/Programação/agendai-back-end/src/modules/users/useCases/createUser/CreateUserUseCase.spec.ts)

### Testes de Integração (HTTP)

- Objetivo: validar a integração das camadas HTTP → Controller → UseCase → Repository → Prisma → DB.
- Estratégia: construir o app com `buildApp()`, injetar requisições com `app.inject` e usar um banco de testes.
- Pré‑requisitos:
  - Banco de testes acessível via `DATABASE_URL` (ex.: `agendai_test`).
  - Esquema aplicado: `npx prisma db push` (ou `npm run prisma:seed` se necessário).
  - Importar o container de DI nos testes para registrar repositórios/providers: `import "@/shared/container"`.

Exemplo mínimo testando criação de usuário via HTTP:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "@/shared/infra/http/app";
import { prisma } from "@/libs/prismaClient";
import "@/shared/container";

describe("Users (integração HTTP)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("POST /api/users cria usuário", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "John", email: "john@example.com", password: "123456" }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("john@example.com");
  });
});
```

- Dicas:
  - Rode apenas o serviço de banco para integrações locais: `docker compose up -d database`.
  - Use um `DATABASE_URL` exclusivo para testes (ex.: `postgresql://.../agendai_test`).
  - Limpe os dados entre testes com `prisma.$transaction([...deleteMany])` para manter isolamento.
  - Não é necessário subir o servidor HTTP real; `app.inject` envia as requisições internamente.

Configuração de testes:
- Vitest já resolve aliases via [vitest.config.mts](file:///d:/Programação/agendai-back-end/vitest.config.mts) com `vite-tsconfig-paths`.
- Arquivo de setup global: [src/tests/setup.ts](file:///d:/Programação/agendai-back-end/src/tests/setup.ts). Se desejar rodar muitas integrações, considere adicionar `import "@/shared/container"` aqui para evitar importar em cada teste.

## Convenções

- Naming
  - Interfaces: prefixo `I` (ex.: `IServiceRepository`, `ICreateUserDTO`).
  - Use cases: `VerboCasoDeUsoUseCase` (ex.: `CreateServiceUseCase`).
  - Controllers: `VerboCasoDeUsoController`.
- Pastas
  - Uma pasta por caso de uso em `useCases/<nome>/` contendo `UseCase` e `Controller`.
- Validação
  - Sempre validar entrada com Zod (`schemas/`) e aplicar via `validateSchema` como `preHandler` ou diretamente no controller.
- Erros
  - Para erros de negócio/validação, lance `AppError(message, statusCode, details?)`.
- Retorno
  - Padrão recomendado: `{ success: boolean, message?: string, data?: T }`.

## Como Adicionar um Novo Caso de Uso/Endpoint

1. Defina o contrato em `dtos/` (ex.: `ICreateXDTO` e/ou resposta).
2. (Se necessário) Atualize a interface em `repositories/` e implemente em `infra/repositories/` usando `prisma`.
3. Crie `schemas/` com Zod para a entrada.
4. Implemente o `UseCase` em `useCases/<acao>/...UseCase.ts`.
5. Implemente o `Controller` em `useCases/<acao>/...Controller.ts` consumindo o `UseCase` via `container.resolve`.
6. Registre rota em `shared/infra/http/routes/*.routes.ts`, adicionando `preHandler` para validação/autorização.
7. (Opcional) Documente no Swagger e crie testes com Vitest usando mocks.

## Definições

- App: a instância Fastify construída em `buildApp()` com rotas, middlewares e error handler.
- Controller: orquestra a requisição; lê/parsa dados (ou usa `preHandler`), chama o `UseCase` e serializa a resposta.
- UseCase: unidade de regra de negócio atômica, exposta via método `execute` tipado.
- DTO: contratos de entrada/saída para comunicação entre camadas.
- Repository: interface que descreve operações de persistência; implementações em `infra/repositories`.
- Provider: serviços técnicos (hash, datas, etc.) registrados via `tsyringe`.
- Schema: validação com Zod aplicada como `preHandler` ou dentro do controller.
- Middleware: funções `preHandler` Fastify (ex.: `authenticate`, `authorize`) que rodam antes do handler.
- Model/Entity (Prisma): definição das tabelas e relações em `schema.prisma`.
- Container: registro e resolução de dependências via `tsyringe` em `shared/container`.

## Padrões de Escrita

- Imports e caminhos
  - Prefira imports absolutos baseados em `tsconfig` (ex.: `@/shared/errors/AppError`), resolvidos com `tsconfig-paths`/`vite-tsconfig-paths`.
- Estrutura de casos de uso
  - Um método público `execute` por `UseCase`, com dependências injetadas via construtor.
  - Não acoplar a camada HTTP; o `UseCase` recebe tipos puros (DTOs) e retorna DTOs.
- Controllers e rotas
  - Controllers curtos, sem lógica de negócio; delegar ao `UseCase`.
  - Validar entrada com Zod via `validateSchema` no `preHandler` quando possível.
  - Rotas no escopo `/api`, recursos no plural e verbos HTTP padrão.
- Respostas e erros
  - Respostas: `{ success: boolean, message?: string, data?: T }` com status apropriado.
  - Erros de domínio/validação: `throw new AppError(msg, statusCode, details?)`.
  - O handler global converte exceções em respostas JSON consistentes.
- Persistência (Prisma)
  - Usar `select` para evitar retornar colunas sensíveis (ex.: `password`).
  - Preferir transações (`prisma.$transaction`) para operações dependentes.
  - Manter nomes de campos alinhados ao domínio; usar enums do Prisma quando fizer sentido.
- Segurança e logs
  - Nunca logar segredos ou tokens; usar o logger do Fastify (já habilitado) no nível adequado.
  - Validar e tratar entradas com Zod em todas as rotas de escrita.
- Nomenclatura
  - Interfaces: prefixo `I` (ex.: `IQueueRepository`, `ICreateUserDTO`).
  - Classes: `PascalCase`; métodos: `camelCase`.
  - Pastas de `useCases`: uma por caso (ex.: `createUser/`, `updateService/`) contendo `Controller` e `UseCase`.

## Pacotes Utilizados

- fastify: servidor HTTP de alta performance.
- @fastify/cors: habilita CORS com configuração de origens permitidas.
- @fastify/helmet: adiciona cabeçalhos de segurança.
- @fastify/rate-limit: proteção contra abuso por limite de requisições.
- @fastify/swagger e @fastify/swagger-ui: geração e UI da documentação OpenAPI.
- @prisma/client: cliente Prisma em tempo de execução.
- @prisma/adapter-pg: adapter do Prisma para usar o pool do `pg` (driver PostgreSQL).
- pg: driver oficial PostgreSQL para Node.js.
- bcryptjs: hash de senha e comparação.
- jsonwebtoken: criação e verificação de tokens JWT.
- dayjs: utilitários de data/hora leves.
- zod: validação de esquemas para requests e objetos.
- tsyringe: injeção de dependências baseada em decorators/reflection.
- reflect-metadata: suporte a metadata necessário para `tsyringe`.
- tsconfig-paths: resolve paths/aliases definidos no `tsconfig` em tempo de execução.

Dev:
- prisma: CLI do Prisma (migrate, generate).
- typescript: compilador TS.
- tsx: execução TS com watch (usado no dev e no Docker).
- tsup: empacotamento da pasta `src` para `dist` em build de produção.
- vitest: test runner com API compatível com Jest.
- vite-tsconfig-paths: plugin para resolver aliases nos testes.
- @types/*: tipagens de ambientação para Node, JWT, bcrypt, pg etc.

## Dicas para IA

- Siga a arquitetura: Rotas → preHandlers → Controller → UseCase → Repository → Prisma.
- Sempre use Zod para validar `request.body` antes de executar o caso de uso.
- Use `AppError` para erros controlados; deixe erros inesperados subirem para o handler global.
- Resolva dependências com `tsyringe` (`container.resolve`) e mantenha registros em `shared/container`.
- Evite acoplamento entre módulos; interaja via interfaces de repositório.
- Mantenha respostas consistentes (`success`, `message`, `data`) e status HTTP adequados.

---

Em caso de dúvidas sobre padrões ou extensões, procure por exemplos existentes em `src/modules/*/useCases` e `shared/infra/http/routes`. Esses arquivos representam a fonte de verdade do estilo e fluxo da aplicação.
