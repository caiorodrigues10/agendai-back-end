# Inventário de pacotes — Backend (agendai-back-end)

> Fonte: `package.json`. Transitivas ficam no lockfile.
> Atualize no mesmo PR que alterar dependências.

**Versão do app:** `1.0.0`

## dependencies

| Pacote | Versão | Categoria | Finalidade | Evidência de uso |
|---|---|---|---|---|
| `@fastify/cookie` | `^9.4.0` | HTTP | Cookies | app Fastify |
| `@fastify/cors` | `^9.0.1` | HTTP | CORS | app.ts |
| `@fastify/helmet` | `^11.1.1` | HTTP | Headers de segurança | app.ts |
| `@fastify/multipart` | `^8.3.1` | HTTP | Upload multipart | logo/avatar |
| `@fastify/rate-limit` | `^9.1.0` | HTTP | Rate limit | app.ts |
| `@fastify/swagger` | `^8.15.0` | HTTP | OpenAPI | app |
| `@fastify/swagger-ui` | `^4.1.0` | HTTP | UI Swagger | app |
| `@fastify/websocket` | `^10.0.1` | Realtime | WebSocket | ws.routes.ts |
| `@google-cloud/storage` | `^7.21.0` | Storage | GCS | GcsStorageProvider |
| `@opentelemetry/api` | `^1.9.0` | Observabilidade | API OTEL | instrumentação |
| `@opentelemetry/exporter-prometheus` | `^0.56.0` | Observabilidade | Métricas Prometheus | OTEL_ENABLED |
| `@opentelemetry/instrumentation-dns` | `^0.64.0` | Observabilidade | Instr. DNS | OTEL |
| `@opentelemetry/instrumentation-fastify` | `^0.57.0` | Observabilidade | Instr. Fastify | OTEL |
| `@opentelemetry/instrumentation-http` | `^0.221.0` | Observabilidade | Instr. HTTP | OTEL |
| `@opentelemetry/instrumentation-pg` | `^0.73.0` | Observabilidade | Instr. PG | OTEL |
| `@opentelemetry/instrumentation-redis-4` | `^0.49.0` | Observabilidade | Instr. Redis | OTEL |
| `@opentelemetry/resources` | `^1.30.0` | Observabilidade | Resources OTEL | OTEL |
| `@opentelemetry/sdk-node` | `^0.56.0` | Observabilidade | SDK Node OTEL | OTEL |
| `@opentelemetry/semantic-conventions` | `^1.30.0` | Observabilidade | Convenções semânticas | OTEL |
| `@prisma/adapter-pg` | `6.4.0` | Persistência | Adapter Prisma → pg | libs/prismaClient.ts |
| `@prisma/client` | `6.4.0` | Persistência | Cliente ORM 6.4.0 | repositórios |
| `@resvg/resvg-js` | `^2.6.2` | Mídia | Rasterização SVG | posts / imagens |
| `@sentry/node` | `^9.0.0` | Observabilidade | Erro tracking | SENTRY_DSN |
| `@sentry/profiling-node` | `^9.0.0` | Observabilidade | Profiling Sentry | Sentry |
| `@upstash/redis` | `^1.38.3` | Cache | Redis Upstash | quando REDIS/Upstash configurado |
| `bcryptjs` | `^2.4.3` | Auth | Hash de senha | BcryptHashProvider |
| `bullmq` | `^6.0.9` | Filas | Jobs Redis | email / whatsapp queues |
| `busboy` | `^1.6.0` | HTTP | Parse multipart | uploads |
| `cloudinary` | `^2.11.0` | Storage | Upload/fallback de imagens (SDK v2) | CloudinaryStorageProvider.ts |
| `dayjs` | `^1.11.13` | Datas | Datas/horários | DayjsDateProvider |
| `disposable-email-domains` | `^1.0.62` | Auth | Bloqueio e-mails descartáveis | emailValidationService |
| `fastify` | `^4.26.2` | HTTP | Framework HTTP | server/app |
| `google-auth-library` | `^11.0.2` | Auth | OAuth Google | Google login |
| `ioredis` | `^6.0.0` | Cache | Cliente Redis | REDIS_URL / BullMQ |
| `jsonwebtoken` | `^9.0.2` | Auth | JWT | authenticate / refresh |
| `mercadopago` | `^3.1.0` | Pagamentos | SDK Mercado Pago | MercadoPagoService (há também fetch direto) |
| `node-cron` | `^4.6.0` | Jobs | Cron in-process | appointmentReminders / postPublisher |
| `pg` | `^8.20.0` | Persistência | Driver PostgreSQL | Prisma adapter |
| `pino` | `^9.4.0` | Logs | Logger | Fastify logger |
| `pino-pretty` | `^13.1.3` | Logs | Pretty print | dev |
| `reflect-metadata` | `^0.2.2` | DI | Metadata TSyringe | container |
| `resend` | `^6.18.1` | E-mail | Envio transacional | ResendEmailProvider |
| `tsconfig-paths` | `^4.2.0` | Build | Aliases runtime | tsx/dev |
| `tsyringe` | `^4.8.0` | DI | Injeção de dependências | shared/container |
| `zod` | `^3.23.8` | Validação | Schemas HTTP | modules/*/schemas |

## devDependencies

| Pacote | Versão | Categoria | Finalidade | Evidência de uso |
|---|---|---|---|---|
| `@testcontainers/postgresql` | `^12.1.0` | Testes | Postgres em container | test:integration:containers |
| `@types/bcryptjs` | `^2.4.6` | Tipos | Tipagens bcryptjs | tsc |
| `@types/busboy` | `^1.5.4` | Tipos | Tipagens busboy | tsc |
| `@types/jsonwebtoken` | `^9.0.6` | Tipos | Tipagens JWT | tsc |
| `@types/node` | `^22.19.20` | Tipos | Tipagens Node | tsc |
| `@types/node-cron` | `^3.0.11` | Tipos | Tipagens cron | tsc |
| `@types/pg` | `^8.18.0` | Tipos | Tipagens pg | tsc |
| `@types/ws` | `^8.18.1` | Tipos | Tipagens WS | tsc |
| `dotenv-cli` | `^11.0.0` | Testes | Env em scripts de teste | test:integration* |
| `prisma` | `6.4.0` | Persistência | CLI Prisma 6.4.0 | migrate/generate |
| `tsup` | `^8.3.5` | Build | Bundler produção | npm run build |
| `tsx` | `^4.19.2` | Dev | Execução TS | npm run dev / seed |
| `typescript` | `^5.7.2` | Core | Compilador | typecheck |
| `vite-tsconfig-paths` | `^6.0.5` | Testes | Aliases Vitest | vitest.config.mts |
| `vitest` | `^4.0.18` | Testes | Runner de testes | npm test / test:unit |

