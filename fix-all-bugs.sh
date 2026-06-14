#!/usr/bin/env bash
# fix-all-bugs.sh
# Execute na raiz do projeto: bash fix-all-bugs.sh
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC}  $*"; }

echo "=========================================="
echo " BarberQueue — Script de correção de bugs"
echo "=========================================="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# FIX 1 — prisma/schema.prisma: datasource sem url
# ─────────────────────────────────────────────────────────────────────────────
echo ">>> FIX 1: prisma/schema.prisma — adicionar url ao datasource"

cat > prisma/schema.prisma << 'PRISMA'
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(uuid()) @db.Uuid
  name          String    @db.VarChar(200)
  email         String    @unique @db.VarChar(100)
  password      String    @db.VarChar(500)
  role          Role      @default(EMPLOYEE)
  barbershopId  String?   @db.Uuid
  cpf           String?   @unique @db.VarChar(11)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  active        Boolean   @default(true)

  barbershop    Barbershop?   @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]
  appointments  Appointment[] @relation("staff")
  feedPosts     FeedPost[]

  @@map("users")
  @@index([cpf])
}

enum Role {
  MASTER_ADMIN
  OWNER
  EMPLOYEE
  CUSTOMER
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @db.VarChar(500)
  userId    String   @db.Uuid
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

enum PaymentMethodEnum {
  credit_card
  debit_card
  pix
}

enum PaymentStatusEnum {
  pending
  approved
  authorized
  in_process
  in_mediation
  rejected
  cancelled
  refunded
  charged_back
}

model Payment {
  id                String            @id @default(uuid()) @db.Uuid
  mpPaymentId       BigInt            @unique
  status            PaymentStatusEnum @default(pending)
  statusDetail      String            @db.VarChar(100)
  paymentMethod     PaymentMethodEnum
  transactionAmount Float             @db.Real
  currency          String            @default("BRL") @db.VarChar(5)
  description       String            @db.VarChar(256)
  barbershopId      String            @db.Uuid
  serviceId         String?           @db.Uuid
  appointmentId     String?           @db.Uuid
  queueItemId       String?           @db.Uuid
  externalReference String?           @db.VarChar(128)
  pixQrCode         String?           @db.Text
  pixQrCodeBase64   String?           @db.Text
  pixExpirationDate DateTime?
  rawResponse       String?           @db.Text
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)

  @@map("payments")
  @@index([barbershopId])
  @@index([status])
  @@index([mpPaymentId])
  @@index([externalReference])
}

model Barbershop {
  id              String         @id @default(uuid()) @db.Uuid
  name            String         @db.VarChar(200)
  whatsapp        String         @db.VarChar(20)
  logoUrl         String?        @db.VarChar(500)
  cnpj            String?        @db.VarChar(20)
  address         String?        @db.Text
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  active          Boolean        @default(true)
  approvalStatus  ApprovalStatus @default(PENDING)
  rejectionReason String?        @db.Text

  schedules         Schedule[]
  services          Service[]
  users             User[]
  queue             QueueItem[]
  appointments      Appointment[]
  feedPosts         FeedPost[]
  subscriptions     Subscription[]
  payments          Payment[]
  serviceCategories ServiceCategory[]
  expenseCategories ExpenseCategory[]
  expenses          Expense[]
  fiados            Fiado[]

  @@map("barbershops")
  @@index([approvalStatus])
  @@index([active])
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

model Schedule {
  id           String  @id @default(uuid()) @db.Uuid
  barbershopId String  @db.Uuid
  dayOfWeek    Int
  isOpen       Boolean @default(false)
  openTime     String  @db.VarChar(5)
  closeTime    String  @db.VarChar(5)

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)

  @@unique([barbershopId, dayOfWeek])
  @@map("schedules")
}

model Service {
  id             String   @id @default(uuid()) @db.Uuid
  barbershopId   String   @db.Uuid
  categoryId     String?  @db.Uuid
  name           String   @db.VarChar(100)
  price          Float    @db.Real
  avgTimeMinutes Int
  icon           String   @db.VarChar(50)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  active         Boolean  @default(true)

  barbershop   Barbershop       @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  category     ServiceCategory? @relation("ServiceToCategory", fields: [categoryId], references: [id], onDelete: SetNull)
  queue        QueueItem[]
  appointments Appointment[]

  @@map("services")
}

model QueueItem {
  id               String      @id @default(uuid()) @db.Uuid
  barbershopId     String      @db.Uuid
  serviceId        String      @db.Uuid
  customerId       String      @db.Uuid
  customerName     String      @db.VarChar(200)
  whatsapp         String      @db.VarChar(20)
  joinedAt         DateTime    @default(now())
  status           QueueStatus @default(WAITING)
  estimatedStartAt DateTime?
  addedByStaff     Boolean     @default(false)
  completedAt      DateTime?
  completedBy      String?     @db.Uuid
  finalPrice       Float?      @db.Real

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  service    Service    @relation(fields: [serviceId], references: [id], onDelete: Restrict)

  @@map("queue")
}

enum QueueStatus {
  WAITING
  IN_CHAIR
  COMPLETED
  CANCELLED
}

model Appointment {
  id           String            @id @default(uuid()) @db.Uuid
  barbershopId String            @db.Uuid
  serviceId    String            @db.Uuid
  staffId      String?           @db.Uuid
  customerName String            @db.VarChar(200)
  whatsapp     String            @db.VarChar(20)
  date         DateTime          @db.Date
  time         String            @db.VarChar(5)
  status       AppointmentStatus @default(CONFIRMED)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  service    Service    @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  staff      User?      @relation("staff", fields: [staffId], references: [id], onDelete: SetNull)

  @@map("appointments")
}

enum AppointmentStatus {
  CONFIRMED
  CANCELLED
  COMPLETED
}

model FeedPost {
  id           String   @id @default(uuid()) @db.Uuid
  barbershopId String   @db.Uuid
  authorId     String?  @db.Uuid
  type         FeedType
  title        String?  @db.VarChar(200)
  content      String   @db.Text
  imageUrl     String?  @db.VarChar(500)
  likes        Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  author     User?      @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@map("feed_posts")
}

enum FeedType {
  HAIRCUT
  BEARD
  ANNOUNCEMENT
}

model Plan {
  id           String   @id @default(uuid()) @db.Uuid
  name         String   @db.VarChar(100)
  description  String?  @db.Text
  price        Float    @db.Real
  maxEmployees Int      @default(1)
  features     String[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  active       Boolean  @default(true)

  subscriptions Subscription[]

  @@map("plans")
}

model Subscription {
  id           String             @id @default(uuid()) @db.Uuid
  barbershopId String             @db.Uuid
  planId       String             @db.Uuid
  status       SubscriptionStatus @default(TRIALING)
  startDate    DateTime           @default(now())
  endDate      DateTime?
  cancelDate   DateTime?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  barbershop Barbershop @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  plan       Plan       @relation(fields: [planId], references: [id], onDelete: Restrict)
  invoices   Invoice[]

  @@unique([barbershopId])
  @@map("subscriptions")
  @@index([status])
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}

model Invoice {
  id             String        @id @default(uuid()) @db.Uuid
  subscriptionId String        @db.Uuid
  amount         Float         @db.Real
  dueDate        DateTime
  paidAt         DateTime?
  status         InvoiceStatus @default(PENDING)
  paymentMethod  String?       @db.VarChar(50)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  subscription Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@map("invoices")
  @@index([status])
  @@index([dueDate])
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}

model BlockedEntity {
  id           String            @id @default(uuid()) @db.Uuid
  type         BlockedEntityType
  value        String            @db.VarChar(20)
  reason       String            @db.VarChar(500)
  blockedAt    DateTime          @default(now())
  unblockedAt  DateTime?
  isActive     Boolean           @default(true)
  barbershopId String?           @db.Uuid
  blockedBy    String?           @db.VarChar(50)
  unblockedBy  String?           @db.VarChar(50)
  externalRef  String?           @db.VarChar(128)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  @@map("blocked_entities")
  @@unique([type, value, isActive])
  @@index([type, value])
  @@index([isActive])
  @@index([barbershopId])
}

enum BlockedEntityType {
  CPF
  CNPJ
}

model AdminNotification {
  id        String                @id @default(uuid()) @db.Uuid
  type      AdminNotificationType
  title     String                @db.VarChar(200)
  message   String                @db.Text
  read      Boolean               @default(false)
  metadata  String?               @db.Text
  createdAt DateTime              @default(now())
  updatedAt DateTime              @updatedAt

  @@map("admin_notifications")
  @@index([read])
  @@index([type])
  @@index([createdAt])
}

enum AdminNotificationType {
  BLOCK_AUTO
  UNBLOCK_AUTO
  UNBLOCK_MANUAL
  SUBSCRIPTION_EXPIRED
  PAYMENT_RECEIVED
}

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @db.Uuid
  action     String   @db.VarChar(100)
  resource   String   @db.VarChar(100)
  resourceId String?  @db.VarChar(100)
  details    String?  @db.Text
  ipAddress  String?  @db.VarChar(50)
  createdAt  DateTime @default(now())

  @@map("audit_logs")
  @@index([userId])
  @@index([action])
  @@index([createdAt])
}

model ServiceCategory {
  id           String   @id @default(uuid()) @db.Uuid
  barbershopId String?  @db.Uuid
  name         String   @db.VarChar(100)
  description  String?  @db.Text
  icon         String?  @db.VarChar(50)
  color        String?  @db.VarChar(7)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  barbershop Barbershop? @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  services   Service[]   @relation("ServiceToCategory")

  @@map("service_categories")
  @@index([barbershopId])
  @@index([active])
}

model ExpenseCategory {
  id           String   @id @default(uuid()) @db.Uuid
  barbershopId String?  @db.Uuid
  name         String   @db.VarChar(100)
  description  String?  @db.Text
  icon         String?  @db.VarChar(50)
  color        String?  @db.VarChar(7)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  barbershop Barbershop? @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  expenses   Expense[]

  @@map("expense_categories")
  @@index([barbershopId])
}

model Expense {
  id            String            @id @default(uuid()) @db.Uuid
  barbershopId  String            @db.Uuid
  categoryId    String?           @db.Uuid
  title         String            @db.VarChar(200)
  description   String?           @db.Text
  amount        Float             @db.Real
  type          ExpenseType       @default(VARIABLE)
  recurrence    ExpenseRecurrence @default(ONCE)
  referenceDate DateTime
  paidAt        DateTime?
  dueDate       DateTime?
  paymentMethod String?           @db.VarChar(50)
  supplierName  String?           @db.VarChar(200)
  receiptUrl    String?           @db.VarChar(500)
  notes         String?           @db.Text
  createdById   String            @db.Uuid
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  barbershop Barbershop       @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  category   ExpenseCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@map("expenses")
  @@index([barbershopId])
  @@index([categoryId])
  @@index([referenceDate])
  @@index([paidAt])
  @@index([type])
}

enum ExpenseType {
  FIXED
  VARIABLE
  INVESTMENT
}

enum ExpenseRecurrence {
  ONCE
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

model Fiado {
  id             String      @id @default(uuid()) @db.Uuid
  barbershopId   String      @db.Uuid
  customerName   String      @db.VarChar(200)
  whatsapp       String      @db.VarChar(20)
  description    String      @db.VarChar(500)
  originalAmount Float       @db.Real
  paidAmount     Float       @default(0) @db.Real
  status         FiadoStatus @default(PENDING)
  dueDate        DateTime?
  notes          String?     @db.Text
  createdById    String      @db.Uuid
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  barbershop Barbershop     @relation(fields: [barbershopId], references: [id], onDelete: Cascade)
  payments   FiadoPayment[]

  @@map("fiados")
  @@index([barbershopId])
  @@index([status])
  @@index([whatsapp])
  @@index([dueDate])
}

enum FiadoStatus {
  PENDING
  PARTIAL
  PAID
  FORGIVEN
}

model FiadoPayment {
  id             String   @id @default(uuid()) @db.Uuid
  fiadoId        String   @db.Uuid
  amount         Float    @db.Real
  notes          String?  @db.Text
  registeredById String   @db.Uuid
  createdAt      DateTime @default(now())

  fiado Fiado @relation(fields: [fiadoId], references: [id], onDelete: Cascade)

  @@map("fiado_payments")
  @@index([fiadoId])
}
PRISMA

ok "prisma/schema.prisma corrigido (url adicionada ao datasource)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 2 — GcsStorageProvider: método uploadBuffer() faltando
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 2: GcsStorageProvider — adicionar uploadBuffer() e corrigir generateSignedUploadUrl()"

mkdir -p src/shared/container/providers/StorageProvider/implementations

cat > src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts << 'GCSPROVIDER'
import { Storage } from "@google-cloud/storage";
import { injectable } from "tsyringe";
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferResult,
} from "../IStorageProvider";

/**
 * Google Cloud Storage Provider
 *
 * Variáveis de ambiente necessárias:
 *   GCS_BUCKET_NAME          — nome do bucket (ex: barberqueue-assets)
 *   GCS_PROJECT_ID           — ID do projeto GCP
 *
 * Autenticação (uma das opções):
 *   GCS_KEY_FILE_PATH        — caminho para o JSON da service account
 *   GCS_CREDENTIALS_JSON     — JSON completo da service account (base64 ou string pura)
 *   (nenhuma)                — usa Application Default Credentials (ADC/Workload Identity)
 *
 * Opcional:
 *   GCS_PUBLIC_BASE_URL      — URL base pública (padrão: https://storage.googleapis.com/<bucket>)
 */
@injectable()
export class GcsStorageProvider implements IStorageProvider {
  private storage: Storage;
  private bucket: ReturnType<Storage["bucket"]>;
  private bucketName: string;
  private publicBaseUrl: string;

  constructor() {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error(
        'GCS_BUCKET_NAME não configurado nas variáveis de ambiente.'
      );
    }
    this.bucketName = bucketName;

    const projectId = process.env.GCS_PROJECT_ID;
    const keyFilePath = process.env.GCS_KEY_FILE_PATH;
    const credentialsJson = process.env.GCS_CREDENTIALS_JSON;

    const storageOptions: ConstructorParameters<typeof Storage>[0] = { projectId };

    if (keyFilePath) {
      storageOptions.keyFilename = keyFilePath;
    } else if (credentialsJson) {
      try {
        const raw = credentialsJson.startsWith("{")
          ? credentialsJson
          : Buffer.from(credentialsJson, "base64").toString("utf-8");
        storageOptions.credentials = JSON.parse(raw);
      } catch {
        throw new Error(
          "GCS_CREDENTIALS_JSON inválido — forneça JSON válido ou base64 de um JSON."
        );
      }
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);

    this.publicBaseUrl =
      (process.env.GCS_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") ||
      `https://storage.googleapis.com/${this.bucketName}`;
  }

  // ── Signed URL de upload (PUT direto cliente → GCS) ──────────────────────

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    const [uploadUrl] = await file.generateSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresInSeconds * 1000,
      contentType: mimeType,
    });

    return {
      uploadUrl,
      publicUrl: `${this.publicBaseUrl}/${objectName}`,
      objectName,
      expiresInSeconds,
    };
  }

  // ── Upload de Buffer (multipart via backend → GCS) ────────────────────────

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<IUploadBufferResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000",
      },
      resumable: false,
    });

    return {
      publicUrl: `${this.publicBaseUrl}/${objectName}`,
      objectName,
      size: buffer.byteLength,
    };
  }

  // ── Deleção (idempotente) ─────────────────────────────────────────────────

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.bucket.file(objectName).delete();
    } catch (err: any) {
      // 404 = objeto já não existe — comportamento idempotente esperado
      if (err?.code === 404) return;
      throw err;
    }
  }

  // ── Extração de objectName a partir de URL pública ────────────────────────

  extractObjectName(publicUrl: string): string | null {
    const prefix = `${this.publicBaseUrl}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return decodeURIComponent(publicUrl.slice(prefix.length));
  }
}
GCSPROVIDER

ok "GcsStorageProvider corrigido (uploadBuffer + generateSignedUploadUrl com v4 PUT)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 3 — routes/index.ts: rotas duplicadas removidas
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 3: routes/index.ts — remover duplicação de rotas"

cat > src/shared/infra/http/routes/index.ts << 'INDEXROUTES'
import { FastifyInstance } from "fastify";

export async function registerRoutes(app: FastifyInstance) {
  // Rota de health-check (não entra no prefixo /api)
  app.get("/health", async () => ({ status: "ok" }));
}
INDEXROUTES

ok "routes/index.ts corrigido (rotas duplicadas removidas)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 4 — app.ts: registrar Swagger
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 4: app.ts — registrar Swagger"

cat > src/shared/infra/http/app.ts << 'APPFILE'
import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { setupSwagger } from "@/config/swagger";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export async function buildApp() {
  const app = fastify({ logger: true });

  // CORS com whitelist de origens configurável via env
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .filter(Boolean);
      // Sem origin = requisição server-side (webhook do MP, ferramentas internas) → permitir
      if (!origin || allowed.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature",
      "X-Request-Id",
    ],
  });

  // Headers de segurança via Helmet
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === "production",
  });

  // Rate-limit global
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      success: false,
      message: "Muitas requisições. Tente novamente em alguns instantes.",
    }),
  });

  // Suporte a upload multipart/form-data
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB máximo por arquivo
      files: 1,
      fields: 5,
    },
  });

  // Swagger (documentação automática da API)
  await setupSwagger(app);

  // Rotas
  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

  // Hook de auditoria global para mutações autenticadas
  app.addHook("preHandler", async (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      request.user
    ) {
      if (request.url.includes("/api/admin/audit-logs")) return;

      try {
        await prisma.auditLog.create({
          data: {
            userId: (request.user as any).id,
            action: `${request.method} ${request.url.split("?")[0]}`,
            resource: request.url.split("/")[2] || "API",
            resourceId: (request.params as any)?.id || null,
            details: JSON.stringify(request.body).substring(0, 500),
            ipAddress: request.ip,
          },
        });
      } catch (err) {
        request.log.error(err as any, "Failed to create audit log");
      }
    }
  });

  // Handler global de erros
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: error.errors,
      });
      return;
    }
    // Rate limit errors do @fastify/rate-limit
    if ((error as any).statusCode === 429) {
      reply.status(429).send({
        success: false,
        message: "Muitas requisições. Tente novamente em alguns instantes.",
      });
      return;
    }
    request.log.error(error);
    reply.status(500).send({
      success: false,
      message: "Erro interno do servidor",
    });
  });

  return app;
}
APPFILE

ok "app.ts corrigido (Swagger registrado)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 5 — FiadoController: import path com case errado (usecases vs useCases)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 5: FiadoController — corrigir import path (usecases → useCases)"

cat > src/modules/fiado/controllers/FiadoController.ts << 'FIADOCTRL'
import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import {
  CreateFiadoUseCase,
  GetFiadoUseCase,
  ListFiadosUseCase,
  UpdateFiadoUseCase,
  DeleteFiadoUseCase,
  AddFiadoPaymentUseCase,
  GetFiadoSummaryUseCase,
} from "../useCases/fiadoUseCases";
import {
  createFiadoSchema,
  updateFiadoSchema,
  createFiadoPaymentSchema,
  listFiadoQuerySchema,
} from "../schemas/fiadoSchemas";
import { AppError } from "@/shared/errors/AppError";

export class FiadoController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createFiadoSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId;

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(CreateFiadoUseCase);
    const fiado = await useCase.execute(
      {
        ...body,
        barbershopId,
        createdById: user.id,
      },
      user
    );

    reply.status(201).send({ success: true, data: fiado });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const useCase = container.resolve(GetFiadoUseCase);
    const fiado = await useCase.execute(id, user);

    reply.send({ success: true, data: fiado });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listFiadoQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(ListFiadosUseCase);
    const result = await useCase.execute({ ...query, barbershopId }, user);

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = updateFiadoSchema.parse(request.body);

    const useCase = container.resolve(UpdateFiadoUseCase);
    const fiado = await useCase.execute(id, body, user);

    reply.send({ success: true, data: fiado });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const useCase = container.resolve(DeleteFiadoUseCase);
    await useCase.execute(id, user);

    reply.status(204).send();
  }

  async addPayment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id: fiadoId } = request.params as { id: string };
    const body = createFiadoPaymentSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(AddFiadoPaymentUseCase);
    const payment = await useCase.execute(
      {
        ...body,
        fiadoId,
        barbershopId,
        registeredById: user.id,
      },
      user
    );

    reply.status(201).send({ success: true, data: payment });
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(GetFiadoSummaryUseCase);
    const summary = await useCase.execute(barbershopId, user);

    reply.send({ success: true, data: summary });
  }
}
FIADOCTRL

ok "FiadoController corrigido (import path useCases com C maiúsculo)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 6 — Criar arquivo useCases/fiadoUseCases.ts apontando para o arquivo real
# O arquivo real está em src/modules/fiado/usecases/fiadoUseCases.ts (lowercase)
# Criamos o alias com C maiúsculo para consistência
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 6: Criar src/modules/fiado/useCases/fiadoUseCases.ts (re-export do arquivo real)"

mkdir -p src/modules/fiado/useCases

# Verifica se o arquivo de origem existe (lowercase)
if [ -f "src/modules/fiado/usecases/fiadoUseCases.ts" ]; then
  # Cria re-export para manter compatibilidade
  cat > src/modules/fiado/useCases/fiadoUseCases.ts << 'FIADOREEXPORT'
// Re-export para manter consistência de nomenclatura (PascalCase)
export * from "../usecases/fiadoUseCases";
FIADOREEXPORT
  ok "Re-export criado em useCases/fiadoUseCases.ts"
else
  # O arquivo pode já estar no lugar certo — copia para o local correto
  mkdir -p src/modules/fiado/useCases
  cat > src/modules/fiado/useCases/fiadoUseCases.ts << 'FIADOUSECASES'
import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IFiadoRepository } from "../repositories/IFiadoRepository";
import {
  ICreateFiadoDTO,
  ICreateFiadoPaymentDTO,
  IUpdateFiadoDTO,
  IFiadoResponseDTO,
  IFiadoListQuery,
  IFiadoSummary,
  IFiadoPaymentResponseDTO,
} from "../dtos/IFiadoDTO";

@injectable()
export class CreateFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    data: ICreateFiadoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.fiadoRepository.create(data);
  }
}

@injectable()
export class GetFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return fiado;
  }
}

@injectable()
export class ListFiadosUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    query: IFiadoListQuery & { barbershopId: string },
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IFiadoResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      query.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.fiadoRepository.list(query);
  }
}

@injectable()
export class UpdateFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateFiadoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    if (fiado.status === "PAID" && data.status !== "FORGIVEN") {
      throw new AppError("Fiado já quitado não pode ser editado", 400);
    }
    return this.fiadoRepository.update(id, data);
  }
}

@injectable()
export class DeleteFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    await this.fiadoRepository.delete(id);
  }
}

@injectable()
export class AddFiadoPaymentUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    data: ICreateFiadoPaymentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoPaymentResponseDTO> {
    const fiado = await this.fiadoRepository.findById(data.fiadoId);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    if (fiado.status === "PAID" || fiado.status === "FORGIVEN") {
      throw new AppError("Este fiado já está encerrado", 400);
    }

    if (data.amount > fiado.remainingAmount) {
      throw new AppError(
        `Valor do pagamento (R$${data.amount}) maior que o saldo devedor (R$${fiado.remainingAmount})`,
        400
      );
    }
    return this.fiadoRepository.addPayment(data);
  }
}

@injectable()
export class GetFiadoSummaryUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) {}

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoSummary> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.fiadoRepository.getSummary(barbershopId);
  }
}
FIADOUSECASES
  ok "useCases/fiadoUseCases.ts criado"
fi

# ─────────────────────────────────────────────────────────────────────────────
# FIX 7 — CategoryRepository: import path errado
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 7: CategoryRepository — corrigir import path de ICategoryDTO"

mkdir -p src/modules/serviceCategories/infra/repositories

cat > src/modules/serviceCategories/infra/repositories/CategoryRepository.ts << 'CATREPO'
import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import {
  IServiceCategoryRepository,
  IExpenseCategoryRepository,
} from "../../repositories/ICategoryRepository";
import {
  ICreateServiceCategoryDTO,
  IUpdateServiceCategoryDTO,
  IServiceCategoryResponseDTO,
  ICreateExpenseCategoryDTO,
  IUpdateExpenseCategoryDTO,
  IExpenseCategoryResponseDTO,
} from "@/modules/services/dtos/ICategoryDTO";
import {
  mapServiceCategoryToDTO,
  mapExpenseCategoryToDTO,
} from "./categoryMapper";

// ─── ServiceCategoryRepository ────────────────────────────────────────────────

export class ServiceCategoryRepository implements IServiceCategoryRepository {
  async create(data: ICreateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO> {
    const record = await prisma.serviceCategory.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
    return mapServiceCategoryToDTO(record);
  }

  async findById(id: string): Promise<IServiceCategoryResponseDTO | null> {
    const record = await prisma.serviceCategory.findUnique({ where: { id } });
    return record ? mapServiceCategoryToDTO(record) : null;
  }

  async list(barbershopId?: string, onlyActive = true): Promise<IServiceCategoryResponseDTO[]> {
    const where: Prisma.ServiceCategoryWhereInput = {};

    if (onlyActive) where.active = true;

    if (barbershopId) {
      where.OR = [
        { barbershopId: null },
        { barbershopId },
      ];
    } else {
      where.barbershopId = null;
    }

    const records = await prisma.serviceCategory.findMany({
      where,
      orderBy: [{ barbershopId: "asc" }, { name: "asc" }],
    });

    return records.map(mapServiceCategoryToDTO);
  }

  async update(id: string, data: IUpdateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO> {
    const record = await prisma.serviceCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    return mapServiceCategoryToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.serviceCategory.delete({ where: { id } });
  }
}

// ─── ExpenseCategoryRepository ────────────────────────────────────────────────

export class ExpenseCategoryRepository implements IExpenseCategoryRepository {
  async create(data: ICreateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO> {
    const record = await prisma.expenseCategory.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
    return mapExpenseCategoryToDTO(record);
  }

  async findById(id: string): Promise<IExpenseCategoryResponseDTO | null> {
    const record = await prisma.expenseCategory.findUnique({ where: { id } });
    return record ? mapExpenseCategoryToDTO(record) : null;
  }

  async list(barbershopId?: string, onlyActive = true): Promise<IExpenseCategoryResponseDTO[]> {
    const where: Prisma.ExpenseCategoryWhereInput = {};

    if (onlyActive) where.active = true;

    if (barbershopId) {
      where.OR = [
        { barbershopId: null },
        { barbershopId },
      ];
    } else {
      where.barbershopId = null;
    }

    const records = await prisma.expenseCategory.findMany({
      where,
      orderBy: [{ barbershopId: "asc" }, { name: "asc" }],
    });

    return records.map(mapExpenseCategoryToDTO);
  }

  async update(id: string, data: IUpdateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO> {
    const record = await prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
    return mapExpenseCategoryToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.expenseCategory.delete({ where: { id } });
  }
}
CATREPO

ok "CategoryRepository corrigido (import @/modules/services/dtos/ICategoryDTO)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 8 — categoryMapper: import path errado
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 8: categoryMapper — corrigir import path de ICategoryDTO"

cat > src/modules/serviceCategories/infra/repositories/categoryMapper.ts << 'CATMAPPER'
import { Prisma } from "@prisma/client";
import {
  IServiceCategoryResponseDTO,
  IExpenseCategoryResponseDTO,
} from "@/modules/services/dtos/ICategoryDTO";

export type ServiceCategoryRecord = Prisma.ServiceCategoryGetPayload<Record<string, never>>;
export type ExpenseCategoryRecord = Prisma.ExpenseCategoryGetPayload<Record<string, never>>;

export function mapServiceCategoryToDTO(r: ServiceCategoryRecord): IServiceCategoryResponseDTO {
  return {
    id: r.id,
    barbershopId: r.barbershopId ?? null,
    isGlobal: r.barbershopId === null,
    name: r.name,
    description: r.description ?? null,
    icon: r.icon ?? null,
    color: r.color ?? null,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function mapExpenseCategoryToDTO(r: ExpenseCategoryRecord): IExpenseCategoryResponseDTO {
  return {
    id: r.id,
    barbershopId: r.barbershopId ?? null,
    isGlobal: r.barbershopId === null,
    name: r.name,
    description: r.description ?? null,
    icon: r.icon ?? null,
    color: r.color ?? null,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
CATMAPPER

ok "categoryMapper corrigido"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 9 — Criar rotas de categorias e registrá-las na api.ts
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 9: Criar categories.routes.ts e controllers para categorias"

mkdir -p src/modules/serviceCategories/controllers

cat > src/modules/serviceCategories/controllers/CategoryController.ts << 'CATCTRL'
import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import {
  ServiceCategoryRepository,
  ExpenseCategoryRepository,
} from "../infra/repositories/CategoryRepository";
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from "../schemas/categorySchemas";

const serviceCatRepo = new ServiceCategoryRepository();
const expenseCatRepo = new ExpenseCategoryRepository();

// ─── Service Categories ───────────────────────────────────────────────────────

export class ServiceCategoryController {
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId
        : user.barbershopId;

    const data = await serviceCatRepo.list(barbershopId, true);
    reply.send({ success: true, data });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createServiceCategorySchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.body as any).barbershopId ?? null)
        : user.barbershopId ?? null;

    const data = await serviceCatRepo.create({ ...body, barbershopId });
    reply.status(201).send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateServiceCategorySchema.parse(request.body);

    const existing = await serviceCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    const data = await serviceCatRepo.update(id, body);
    reply.send({ success: true, data });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    const existing = await serviceCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    await serviceCatRepo.delete(id);
    reply.status(204).send();
  }
}

// ─── Expense Categories ───────────────────────────────────────────────────────

export class ExpenseCategoryController {
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId
        : user.barbershopId;

    const data = await expenseCatRepo.list(barbershopId, true);
    reply.send({ success: true, data });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createExpenseCategorySchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.body as any).barbershopId ?? null)
        : user.barbershopId ?? null;

    const data = await expenseCatRepo.create({ ...body, barbershopId });
    reply.status(201).send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateExpenseCategorySchema.parse(request.body);

    const existing = await expenseCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    const data = await expenseCatRepo.update(id, body);
    reply.send({ success: true, data });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    const existing = await expenseCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    await expenseCatRepo.delete(id);
    reply.status(204).send();
  }
}
CATCTRL

ok "CategoryController criado"

cat > src/shared/infra/http/routes/categories.routes.ts << 'CATROUTES'
import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import {
  ServiceCategoryController,
  ExpenseCategoryController,
} from "@/modules/serviceCategories/controllers/CategoryController";

const serviceCat = new ServiceCategoryController();
const expenseCat = new ExpenseCategoryController();

export async function categoriesRoutes(app: FastifyInstance) {
  const staffGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]),
    checkSubscription,
  ];
  const ownerGuard = [
    authenticate,
    authorize(["MASTER_ADMIN", "OWNER"]),
    checkSubscription,
  ];

  // ─── Service Categories ───────────────────────────────────────────────────
  app.get(
    "/service-categories",
    { preHandler: staffGuard },
    serviceCat.list.bind(serviceCat)
  );
  app.post(
    "/service-categories",
    { preHandler: ownerGuard },
    serviceCat.create.bind(serviceCat)
  );
  app.patch(
    "/service-categories/:id",
    { preHandler: ownerGuard },
    serviceCat.update.bind(serviceCat)
  );
  app.delete(
    "/service-categories/:id",
    { preHandler: ownerGuard },
    serviceCat.delete.bind(serviceCat)
  );

  // ─── Expense Categories ───────────────────────────────────────────────────
  app.get(
    "/expense-categories",
    { preHandler: staffGuard },
    expenseCat.list.bind(expenseCat)
  );
  app.post(
    "/expense-categories",
    { preHandler: ownerGuard },
    expenseCat.create.bind(expenseCat)
  );
  app.patch(
    "/expense-categories/:id",
    { preHandler: ownerGuard },
    expenseCat.update.bind(expenseCat)
  );
  app.delete(
    "/expense-categories/:id",
    { preHandler: ownerGuard },
    expenseCat.delete.bind(expenseCat)
  );
}
CATROUTES

ok "categories.routes.ts criado"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 10 — api.ts: registrar categoriesRoutes
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 10: api.ts — registrar categoriesRoutes"

cat > src/shared/infra/http/routes/api.ts << 'APIROUTES'
import { FastifyInstance } from "fastify";
import { usersRoutes } from "./users.routes";
import { servicesRoutes } from "./services.routes";
import { barbershopsRoutes } from "./barbershops.routes";
import { queueRoutes } from "./queue.routes";
import { authRoutes } from "./auth.routes";
import { adminRoutes } from "./admin.routes";
import { adminFinancialRoutes } from "./adminFinancial.routes";
import { paymentRoutes } from "./payments.routes";
import { plansRoutes } from "./plans.routes";
import { fiadoRoutes } from "./fiado.routes";
import { expensesRoutes } from "./expenses.routes";
import { barbershopFinancialRoutes } from "./barbershopFinancialRoutes";
import { categoriesRoutes } from "./categories.routes";

export async function apiRoutes(app: FastifyInstance) {
  await authRoutes(app);
  await usersRoutes(app);
  await servicesRoutes(app);
  await barbershopsRoutes(app);
  await queueRoutes(app);
  await adminRoutes(app);
  await adminFinancialRoutes(app);
  await paymentRoutes(app);
  await plansRoutes(app);
  await fiadoRoutes(app);
  await expensesRoutes(app);
  await barbershopFinancialRoutes(app);
  await categoriesRoutes(app);
}
APIROUTES

ok "api.ts atualizado (categoriesRoutes registrado)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 11 — container/index.ts: registrar ServiceCategoryRepository e ExpenseCategoryRepository
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 11: container/index.ts — registrar repositórios de categorias"

cat > src/shared/container/index.ts << 'CONTAINER'
import "reflect-metadata";
import { container } from "tsyringe";
import "@/shared/container/providers";

import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";

import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { ServiceRepository } from "@/modules/services/infra/repositories/ServiceRepository";

import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { BarbershopRepository } from "@/modules/barbershops/infra/repositories/BarbershopRepository";

import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { QueueRepository } from "@/modules/queue/infra/repositories/QueueRepository";

import { IPaymentRepository } from "@/modules/payments/repositories/IPaymentRepository";
import { PaymentRepository } from "@/modules/payments/infra/repositories/PaymentRepository";

import { MercadoPagoService } from "@/modules/payments/services/MercadoPagoService";

import { IPlanRepository } from "@/modules/plans/repositories/IPlanRepository";
import { PlanRepository } from "@/modules/plans/infra/repositories/PlanRepository";

import { IFiadoRepository } from "@/modules/fiado/repositories/IFiadoRepository";
import { FiadoRepository } from "@/modules/fiado/repositories/FiadoRepository";

import { IExpenseRepository } from "@/modules/expenses/repositories/IExpenseRepository";
import { ExpenseRepository } from "@/modules/expenses/infra/repositories/ExpenseRepository";

import {
  IServiceCategoryRepository,
  IExpenseCategoryRepository,
} from "@/modules/serviceCategories/repositories/ICategoryRepository";
import {
  ServiceCategoryRepository,
  ExpenseCategoryRepository,
} from "@/modules/serviceCategories/infra/repositories/CategoryRepository";

container.registerSingleton<IUserRepository>("UserRepository", UserRepository);
container.registerSingleton<IServiceRepository>("ServiceRepository", ServiceRepository);
container.registerSingleton<IBarbershopRepository>("BarbershopRepository", BarbershopRepository);
container.registerSingleton<IQueueRepository>("QueueRepository", QueueRepository);
container.registerSingleton<IPaymentRepository>("PaymentRepository", PaymentRepository);
container.registerSingleton<MercadoPagoService>("MercadoPagoService", MercadoPagoService);
container.registerSingleton<IPlanRepository>("PlanRepository", PlanRepository);
container.registerSingleton<IFiadoRepository>("FiadoRepository", FiadoRepository);
container.registerSingleton<IExpenseRepository>("ExpenseRepository", ExpenseRepository);
container.registerSingleton<IServiceCategoryRepository>(
  "ServiceCategoryRepository",
  ServiceCategoryRepository
);
container.registerSingleton<IExpenseCategoryRepository>(
  "ExpenseCategoryRepository",
  ExpenseCategoryRepository
);
CONTAINER

ok "container/index.ts atualizado (repositórios de categorias registrados)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 12 — MockQueueRepository: lança Error genérico em vez de AppError
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 12: MockQueueRepository — usar AppError em vez de Error genérico"

cat > src/modules/queue/infra/repositories/mocks/MockQueueRepository.ts << 'MOCKREPO'
import { IQueueRepository } from "@/modules/queue/repositories/IQueueRepository";
import { IJoinQueueDTO } from "@/modules/queue/dtos/IJoinQueueDTO";
import { IQueueItemResponseDTO } from "@/modules/queue/dtos/IQueueItemResponseDTO";
import { AppError } from "@/shared/errors/AppError";

export class MockQueueRepository implements IQueueRepository {
  private data: IQueueItemResponseDTO[] = [];
  private seq = 1;

  async create(payload: IJoinQueueDTO): Promise<IQueueItemResponseDTO> {
    const id = `queue-${this.seq++}`;
    const now = Date.now();
    const entity: IQueueItemResponseDTO = {
      id,
      barbershopId: payload.barbershopId,
      serviceId: payload.serviceId,
      customerId: payload.customerId,
      customerName: payload.customerName,
      whatsapp: payload.whatsapp,
      joinedAt: now,
      status: "waiting",
      addedByStaff: payload.addedByStaff ?? false,
    };
    this.data.push(entity);
    return entity;
  }

  async list(barbershopId?: string): Promise<IQueueItemResponseDTO[]> {
    if (!barbershopId) return [...this.data];
    return this.data.filter((q) => q.barbershopId === barbershopId);
  }

  async findById(id: string): Promise<IQueueItemResponseDTO | null> {
    return this.data.find((q) => q.id === id) ?? null;
  }

  async updateStatus(
    id: string,
    status: string,
    details?: any
  ): Promise<IQueueItemResponseDTO> {
    const idx = this.data.findIndex((q) => q.id === id);
    if (idx < 0) throw new AppError("Item de fila não encontrado", 404);

    const current = this.data[idx];
    const patch: Partial<IQueueItemResponseDTO> = { status: status as any };

    if (status === "completed") {
      patch.completedAt = Date.now();
      if (details?.completedBy) patch.completedBy = details.completedBy;
      if (details?.finalPrice != null) patch.finalPrice = details.finalPrice;
    }

    const updated = { ...current, ...patch };
    this.data[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.data = this.data.filter((q) => q.id !== id);
  }

  async countCompleted(barbershopId?: string): Promise<number> {
    return this.data.filter(
      (q) =>
        q.status === "completed" &&
        (!barbershopId || q.barbershopId === barbershopId)
    ).length;
  }
}
MOCKREPO

ok "MockQueueRepository corrigido (AppError em vez de Error genérico)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 13 — users.routes.ts: bind faltando no handler
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 13: users.routes.ts — adicionar .bind() no handler"

cat > src/shared/infra/http/routes/users.routes.ts << 'USERSROUTES'
import { FastifyInstance } from "fastify";
import { CreateUserController } from "@/modules/users/useCases/createUser/CreateUserController";

export async function usersRoutes(app: FastifyInstance) {
  const createUserController = new CreateUserController();

  app.post("/users", {
    schema: {
      tags: ["Users"],
      summary: "Criar novo usuário",
      body: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 3, maxLength: 200 },
          email: { type: "string", format: "email", maxLength: 100 },
          password: { type: "string", minLength: 6, maxLength: 100 },
          role: {
            type: "string",
            enum: ["MASTER_ADMIN", "OWNER", "EMPLOYEE"],
          },
          barbershopId: { type: "string", format: "uuid" },
        },
      },
      response: {
        201: {
          description: "Usuário criado com sucesso",
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
            data: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" },
                barbershopId: {
                  type: "string",
                  format: "uuid",
                  nullable: true,
                },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
  }, createUserController.handle.bind(createUserController));
}
USERSROUTES

ok "users.routes.ts corrigido (.bind() adicionado)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 14 — CreateUserUseCase.ts.bak: arquivo residual (não causa erro mas é lixo)
# Removemos arquivos .bak para não confundir tooling
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 14: Remover arquivos .bak residuais"

for f in \
  "src/modules/users/useCases/createUser/CreateUserUseCase.ts.bak" \
  "src/libs/prismaClient.ts.bak" \
  "src/modules/queue/infra/repositories/QueueRepository.ts.bak" \
  "src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts.bak"
do
  if [ -f "$f" ]; then
    rm "$f"
    ok "Removido: $f"
  else
    warn "Não encontrado (ok): $f"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# FIX 15 — vitest.config.ts: verificar se existe, criar se não
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 15: vitest.config.ts — garantir configuração correta"

if [ ! -f "vitest.config.ts" ]; then
cat > vitest.config.ts << 'VITESTCFG'
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/tests/setup.ts"],
  },
});
VITESTCFG
  ok "vitest.config.ts criado"
else
  # Verifica se tem setupFiles apontando para o setup.ts
  if ! grep -q "setupFiles" vitest.config.ts 2>/dev/null; then
    warn "vitest.config.ts existe mas pode não ter setupFiles configurado — verifique manualmente"
  else
    ok "vitest.config.ts já está configurado"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# FIX 16 — tsconfig.json: garantir paths e decorators habilitados
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 16: tsconfig.json — garantir configuração de paths e decorators"

if [ ! -f "tsconfig.json" ]; then
cat > tsconfig.json << 'TSCFG'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "prisma/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSCFG
  ok "tsconfig.json criado"
else
  # Verifica se experimentalDecorators está habilitado
  if ! grep -q "experimentalDecorators" tsconfig.json 2>/dev/null; then
    warn "tsconfig.json existe mas pode não ter experimentalDecorators — verifique manualmente"
  else
    ok "tsconfig.json está configurado"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# FIX 17 — scripts/ensure-gcs-key.sh: garantir script de placeholder do GCS
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 17: scripts/ensure-gcs-key.sh — criar se não existir"

mkdir -p scripts

if [ ! -f "scripts/ensure-gcs-key.sh" ]; then
cat > scripts/ensure-gcs-key.sh << 'GCSKEYSH'
#!/usr/bin/env bash
# Cria um placeholder de gcs-key.json se ele não existir.
# Necessário para o docker-compose montar o volume sem erro.
set -euo pipefail

KEY_FILE="./gcs-key.json"

if [ -f "$KEY_FILE" ]; then
  echo "gcs-key.json já existe — nenhuma ação necessária."
  exit 0
fi

cat > "$KEY_FILE" << 'JSON'
{
  "_comment": "Placeholder. Substitua pelo JSON real da service account do GCP antes de usar em produção.",
  "type": "service_account",
  "project_id": "seu-project-id",
  "private_key_id": "",
  "private_key": "",
  "client_email": "",
  "client_id": "",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
JSON

echo "gcs-key.json placeholder criado em $KEY_FILE"
GCSKEYSH
  chmod +x scripts/ensure-gcs-key.sh
  ok "scripts/ensure-gcs-key.sh criado"
else
  ok "scripts/ensure-gcs-key.sh já existe"
fi

# Cria o placeholder se não existir (necessário para o docker-compose subir)
if [ ! -f "gcs-key.json" ]; then
  bash scripts/ensure-gcs-key.sh
fi


# ─────────────────────────────────────────────────────────────────────────────
# FIX 18 — BlockedEntity schema: @@unique([type, value, isActive]) impede
#           re-bloquear após desbloqueio (isActive false → true choca com índice)
#           Solução: remover isActive do unique, deixar apenas [type, value]
#           com filtro parcial — ou usar índice simples + lógica no service.
#           O blockedEntityService já é idempotente via findFirst/isActive,
#           então o unique em isActive é desnecessário e problemático.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 18: prisma/schema.prisma — corrigir @@unique de BlockedEntity"

# Replace only the BlockedEntity unique constraint line
sed -i 's/  @@unique(\[type, value, isActive\])/  @@index([type, value, isActive])/' prisma/schema.prisma

# Verify the change was applied
if grep -q '@@index(\[type, value, isActive\])' prisma/schema.prisma; then
  ok "BlockedEntity: @@unique([type, value, isActive]) → @@index (re-bloqueio agora funciona)"
else
  warn "Não foi possível aplicar o FIX 18 via sed — verifique prisma/schema.prisma manualmente"
  warn "Linha a corrigir: @@unique([type, value, isActive]) → @@index([type, value, isActive])"
fi

# ─────────────────────────────────────────────────────────────────────────────
# FIX 19 — ICategoryRepository.ts: import path com alias @/ em vez de relativo
#           O import relativo "../../services/dtos/ICategoryDTO" de dentro de
#           src/modules/serviceCategories/repositories/ resolve corretamente
#           no runtime via tsconfig-paths, mas o alias é mais robusto.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 19: ICategoryRepository.ts — garantir import com alias @/"

cat > src/modules/serviceCategories/repositories/ICategoryRepository.ts << 'ICATREPO'
import {
  ICreateServiceCategoryDTO,
  IUpdateServiceCategoryDTO,
  IServiceCategoryResponseDTO,
  ICreateExpenseCategoryDTO,
  IUpdateExpenseCategoryDTO,
  IExpenseCategoryResponseDTO,
} from "@/modules/services/dtos/ICategoryDTO";

export interface IServiceCategoryRepository {
  create(data: ICreateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO>;
  findById(id: string): Promise<IServiceCategoryResponseDTO | null>;
  list(barbershopId?: string, onlyActive?: boolean): Promise<IServiceCategoryResponseDTO[]>;
  update(id: string, data: IUpdateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO>;
  delete(id: string): Promise<void>;
}

export interface IExpenseCategoryRepository {
  create(data: ICreateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO>;
  findById(id: string): Promise<IExpenseCategoryResponseDTO | null>;
  list(barbershopId?: string, onlyActive?: boolean): Promise<IExpenseCategoryResponseDTO[]>;
  update(id: string, data: IUpdateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO>;
  delete(id: string): Promise<void>;
}
ICATREPO

ok "ICategoryRepository.ts: import atualizado para alias @/"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 20 — fiadoMapper.ts: importa Prisma de @/libs/prismaClient mas o tipo
#           FiadoPaymentRecord usa Prisma.FiadoPaymentGetPayload<Record<string,never>>
#           O prismaClient.ts re-exporta Prisma de @prisma/client, então funciona,
#           mas para clareza e consistência com os outros mappers, usar @prisma/client
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 20: fiadoMapper.ts — normalizar import Prisma para @prisma/client"

cat > src/modules/fiado/repositories/fiadoMapper.ts << 'FIADOMAPPER'
import { Prisma } from "@prisma/client";
import { IFiadoResponseDTO, IFiadoPaymentResponseDTO, FiadoStatus } from "../dtos/IFiadoDTO";

export type FiadoWithPayments = Prisma.FiadoGetPayload<{
  include: { payments: true };
}>;

export type FiadoPaymentRecord = Prisma.FiadoPaymentGetPayload<Record<string, never>>;

export function mapPaymentToDTO(record: FiadoPaymentRecord): IFiadoPaymentResponseDTO {
  return {
    id: record.id,
    fiadoId: record.fiadoId,
    amount: record.amount,
    notes: record.notes ?? null,
    registeredById: record.registeredById,
    createdAt: record.createdAt,
  };
}

export function mapFiadoToDTO(record: FiadoWithPayments): IFiadoResponseDTO {
  const now = new Date();
  const remaining = record.originalAmount - record.paidAmount;
  const isOverdue =
    record.dueDate != null &&
    record.dueDate < now &&
    (record.status === "PENDING" || record.status === "PARTIAL");

  return {
    id: record.id,
    barbershopId: record.barbershopId,
    customerName: record.customerName,
    whatsapp: record.whatsapp,
    description: record.description,
    originalAmount: record.originalAmount,
    paidAmount: record.paidAmount,
    remainingAmount: Math.max(0, remaining),
    status: record.status as FiadoStatus,
    dueDate: record.dueDate ?? null,
    notes: record.notes ?? null,
    createdById: record.createdById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    payments: record.payments.map(mapPaymentToDTO),
    isOverdue,
  };
}
FIADOMAPPER

ok "fiadoMapper.ts: Prisma importado de @prisma/client (direto, sem intermediário)"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 21 — SubscribeUseCase.ts: passa `data` (ISubscribeDTO) para createCardPayment
#           que espera ICreateCardPaymentDTO. O campo `token` em ISubscribeDTO é
#           `cardToken`, mas ICreateCardPaymentDTO espera `token`. Isso causa
#           runtime error silencioso (token = undefined → MP rejeita com 400).
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 21: SubscribeUseCase.ts — corrigir mapeamento cardToken → token para MP"

cat > src/modules/subscriptions/useCases/subscribe/SubscribeUseCase.ts << 'SUBSCRIBEUSECASE'
import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { MercadoPagoService } from "@/modules/payments/services/MercadoPagoService";
import { IPaymentRepository } from "@/modules/payments/repositories/IPaymentRepository";
import { AppError } from "@/shared/errors/AppError";
import { ISubscribeDTO, ISubscriptionResponseDTO } from "../../dtos/ISubscriptionDTO";
import { buildSubscriptionResponse } from "../../utils/subscriptionMapper";

const TRIAL_DAYS = 30;

@injectable()
export class SubscribeUseCase {
  constructor(
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService,
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository
  ) { }

  async execute(
    data: ISubscribeDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<ISubscriptionResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: data.barbershopId },
      select: { id: true, name: true, active: true, createdAt: true }
    });

    if (!barbershop || !barbershop.active) {
      throw new AppError("Barbearia não encontrada ou inativa", 404);
    }

    const plan = await prisma.plan.findUnique({
      where: { id: data.planId },
      select: { id: true, name: true, price: true, active: true }
    });

    if (!plan || !plan.active) {
      throw new AppError("Plano não encontrado ou inativo", 404);
    }

    const existing = await prisma.subscription.findUnique({
      where: { barbershopId: data.barbershopId }
    });

    if (existing && ["TRIALING", "ACTIVE"].includes(existing.status)) {
      throw new AppError(
        "Já existe uma assinatura ativa. Cancele a atual antes de assinar um novo plano.",
        409
      );
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const subscription = await prisma.subscription.upsert({
      where: { barbershopId: data.barbershopId },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        startDate: new Date(),
        endDate: dueDate,
        cancelDate: null
      },
      create: {
        barbershopId: data.barbershopId,
        planId: plan.id,
        status: "ACTIVE",
        startDate: new Date(),
        endDate: dueDate
      }
    });

    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.price,
        dueDate,
        status: "PENDING",
        paymentMethod: data.paymentMethod
      }
    });

    const externalReference = `bq-sub-${subscription.id}-inv-${invoice.id}`;
    const description = `Assinatura BarberQueue — ${plan.name}`;

    try {
      if (data.paymentMethod === "pix") {
        const mpResponse = await this.mpService.createPixPayment({
          transactionAmount: plan.price,
          description,
          payer: {
            email: data.payerEmail,
            firstName: data.payerFirstName,
            lastName: data.payerLastName,
            identification: data.payerIdentification
          },
          barbershopId: data.barbershopId,
          externalReference,
          expirationMinutes: 60 * 24
        });

        await this.paymentRepo.create({
          mpPaymentId: mpResponse.id,
          status: mpResponse.status as any,
          statusDetail: mpResponse.status_detail,
          paymentMethod: "pix",
          transactionAmount: mpResponse.transaction_amount,
          currency: mpResponse.currency_id,
          description,
          barbershopId: data.barbershopId,
          externalReference,
          pixQrCode: mpResponse.point_of_interaction?.transaction_data?.qr_code ?? null,
          pixQrCodeBase64: mpResponse.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
          pixExpirationDate: mpResponse.date_of_expiration
            ? new Date(mpResponse.date_of_expiration)
            : null,
          rawResponse: JSON.stringify(mpResponse)
        });

      } else {
        // FIX 21: ISubscribeDTO usa `cardToken`; ICreateCardPaymentDTO usa `token`
        if (!data.cardToken || !data.cardPaymentMethodId) {
          throw new AppError("Token e método de pagamento do cartão são obrigatórios", 400);
        }
        if (!data.payerIdentification) {
          throw new AppError("Identificação (CPF/CNPJ) é obrigatória para cartão", 400);
        }

        const mpResponse = await this.mpService.createCardPayment(
          {
            token: data.cardToken,              // ← FIX: cardToken → token
            transactionAmount: plan.price,
            description,
            installments: data.cardInstallments ?? 1,  // ← FIX: incluir installments
            paymentMethodId: data.cardPaymentMethodId, // ← FIX: campo correto
            payer: {
              email: data.payerEmail,
              firstName: data.payerFirstName,
              lastName: data.payerLastName,
              identification: data.payerIdentification
            },
            barbershopId: data.barbershopId,
            externalReference
          },
          data.barbershopId
        );

        const paymentMethod =
          mpResponse.payment_type_id === "debit_card" ? "debit_card" : "credit_card";

        await this.paymentRepo.create({
          mpPaymentId: mpResponse.id,
          status: mpResponse.status as any,
          statusDetail: mpResponse.status_detail,
          paymentMethod: paymentMethod as any,
          transactionAmount: mpResponse.transaction_amount,
          currency: mpResponse.currency_id,
          description,
          barbershopId: data.barbershopId,
          externalReference,
          rawResponse: JSON.stringify(mpResponse)
        });

        if (mpResponse.status === "approved") {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "PAID", paidAt: new Date(), paymentMethod }
          });
        }
      }
    } catch (error: any) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE" }
      });
      throw new AppError(
        `Erro ao processar pagamento: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    const full = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: {
        plan: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    return buildSubscriptionResponse(full, barbershop.createdAt, TRIAL_DAYS);
  }
}
SUBSCRIBEUSECASE

ok "SubscribeUseCase.ts: cardToken→token e cardInstallments→installments corrigidos"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 22 — ISubscribeDTO: cardInstallments estava faltando no tipo
#           (usado no FIX 21 acima — garante que o campo existe no DTO)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 22: ISubscriptionDTO.ts — garantir campo cardInstallments no ISubscribeDTO"

# Only patch if cardInstallments is not already there
if ! grep -q "cardInstallments" src/modules/subscriptions/dtos/ISubscriptionDTO.ts 2>/dev/null; then
  sed -i 's/cardToken?: string;/cardToken?: string;\n  cardInstallments?: number;/' \
    src/modules/subscriptions/dtos/ISubscriptionDTO.ts
  ok "ISubscriptionDTO.ts: campo cardInstallments adicionado"
else
  ok "ISubscriptionDTO.ts: cardInstallments já presente"
fi

# ─────────────────────────────────────────────────────────────────────────────
# FIX 23 — ListQueueController: não vincula `this` corretamente ao chamar
#           `listQueueUseCase.execute` — inofensivo mas, mais importante:
#           O route handler em queue.routes.ts usa `list.handle.bind(list)`
#           mas o método `handle` retorna FastifyReply o que pode gerar
#           aviso de tipo. Garantir que o return type é void.
#
#           Bug real: `app.get("/queue/metrics", ...)` está registrado DEPOIS
#           de `app.patch("/queue/:id", ...)` — em Fastify rotas estáticas
#           têm prioridade sobre parametrizadas, mas "/queue/metrics" compete
#           com "/queue/:id". Em Fastify v4, rotas estáticas têm precedência
#           automática, mas é boa prática registrar estáticas antes.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 23: queue.routes.ts — registrar /queue/metrics antes de /queue/:id"

cat > src/shared/infra/http/routes/queue.routes.ts << 'QUEUEROUTES'
import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { checkSubscription } from "../middlewares/checkSubscription";
import { ListQueueController } from "@/modules/queue/useCases/listQueue/ListQueueController";
import { JoinQueueController } from "@/modules/queue/useCases/joinQueue/JoinQueueController";
import { UpdateQueueItemController } from "@/modules/queue/useCases/updateQueueItem/UpdateQueueItemController";
import { DeleteQueueItemController } from "@/modules/queue/useCases/deleteQueueItem/DeleteQueueItemController";
import { GetQueueMetricsController } from "@/modules/queue/useCases/getQueueMetrics/GetQueueMetricsController";

export async function queueRoutes(app: FastifyInstance) {
  const list    = new ListQueueController();
  const join    = new JoinQueueController();
  const update  = new UpdateQueueItemController();
  const del     = new DeleteQueueItemController();
  const metrics = new GetQueueMetricsController();

  // FIX 23: Rota estática /queue/metrics registrada ANTES de /queue/:id
  // para evitar ambiguidade em versões mais antigas do Fastify
  app.get("/queue/metrics", metrics.handle.bind(metrics));

  app.get("/queue",    { preHandler: [authenticate, checkSubscription] }, list.handle.bind(list));
  app.post("/queue",   join.handle.bind(join)); // público — cliente entra sem conta
  app.patch("/queue/:id",  { preHandler: [authenticate, checkSubscription] }, update.handle.bind(update));
  app.delete("/queue/:id", { preHandler: [authenticate, checkSubscription] }, del.handle.bind(del));
}
QUEUEROUTES

ok "queue.routes.ts: /queue/metrics registrado antes de /queue/:id"

# ─────────────────────────────────────────────────────────────────────────────
# FIX 24 — GcsStorageProvider: construtor lança erro em tempo de inicialização
#           do container DI quando GCS_BUCKET_NAME não está definido,
#           derrubando o servidor mesmo em ambientes de desenvolvimento.
#           Solução: tornar a validação lazy (no primeiro uso), assim o servidor
#           sobe normalmente e só falha ao tentar usar o storage de fato.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo ">>> FIX 24: GcsStorageProvider — tornar inicialização lazy para não derrubar o servidor em dev"

cat > src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts << 'GCSPROVIDER2'
import { Storage } from "@google-cloud/storage";
import { injectable } from "tsyringe";
import {
  IStorageProvider,
  ISignedUploadUrlResult,
  IUploadBufferResult,
} from "../IStorageProvider";

/**
 * Google Cloud Storage Provider — inicialização lazy.
 *
 * Variáveis de ambiente:
 *   GCS_BUCKET_NAME          — nome do bucket (ex: barberqueue-assets)
 *   GCS_PROJECT_ID           — ID do projeto GCP
 *   GCS_KEY_FILE_PATH        — caminho para JSON da service account
 *   GCS_CREDENTIALS_JSON     — JSON da service account em base64 ou string pura
 *   GCS_PUBLIC_BASE_URL      — URL base pública (opcional)
 *
 * O servidor sobe mesmo sem as variáveis configuradas;
 * o erro só ocorre na primeira chamada ao storage.
 */
@injectable()
export class GcsStorageProvider implements IStorageProvider {
  private _storage: Storage | null = null;
  private _bucket: ReturnType<Storage["bucket"]> | null = null;
  private _publicBaseUrl: string | null = null;

  private get bucketName(): string {
    const name = process.env.GCS_BUCKET_NAME;
    if (!name) {
      throw new Error(
        "GCS_BUCKET_NAME não configurado. Defina a variável de ambiente antes de usar o storage."
      );
    }
    return name;
  }

  private get storage(): Storage {
    if (!this._storage) {
      const projectId      = process.env.GCS_PROJECT_ID;
      const keyFilePath    = process.env.GCS_KEY_FILE_PATH;
      const credentialsJson = process.env.GCS_CREDENTIALS_JSON;

      const opts: ConstructorParameters<typeof Storage>[0] = { projectId };

      if (keyFilePath) {
        opts.keyFilename = keyFilePath;
      } else if (credentialsJson) {
        try {
          const raw = credentialsJson.startsWith("{")
            ? credentialsJson
            : Buffer.from(credentialsJson, "base64").toString("utf-8");
          opts.credentials = JSON.parse(raw);
        } catch {
          throw new Error(
            "GCS_CREDENTIALS_JSON inválido — forneça JSON válido ou base64 de um JSON."
          );
        }
      }

      this._storage = new Storage(opts);
    }
    return this._storage;
  }

  private get bucket(): ReturnType<Storage["bucket"]> {
    if (!this._bucket) {
      this._bucket = this.storage.bucket(this.bucketName);
    }
    return this._bucket;
  }

  private get publicBaseUrl(): string {
    if (!this._publicBaseUrl) {
      this._publicBaseUrl =
        (process.env.GCS_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") ||
        `https://storage.googleapis.com/${this.bucketName}`;
    }
    return this._publicBaseUrl;
  }

  async generateSignedUploadUrl(
    folder: string,
    fileName: string,
    mimeType: string,
    expiresInSeconds = 900
  ): Promise<ISignedUploadUrlResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    const [uploadUrl] = await file.generateSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresInSeconds * 1000,
      contentType: mimeType,
    });

    return {
      uploadUrl,
      publicUrl: `${this.publicBaseUrl}/${objectName}`,
      objectName,
      expiresInSeconds,
    };
  }

  async uploadBuffer(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<IUploadBufferResult> {
    const objectName = `${folder}/${fileName}`;
    const file = this.bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000",
      },
      resumable: false,
    });

    return {
      publicUrl: `${this.publicBaseUrl}/${objectName}`,
      objectName,
      size: buffer.byteLength,
    };
  }

  async deleteObject(objectName: string): Promise<void> {
    try {
      await this.bucket.file(objectName).delete();
    } catch (err: any) {
      if (err?.code === 404) return;
      throw err;
    }
  }

  extractObjectName(publicUrl: string): string | null {
    const prefix = `${this.publicBaseUrl}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return decodeURIComponent(publicUrl.slice(prefix.length));
  }
}
GCSPROVIDER2

ok "GcsStorageProvider: inicialização lazy — servidor não quebra sem vars GCS em dev"

# ─────────────────────────────────────────────────────────────────────────────
# SUMÁRIO FINAL
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " CORREÇÕES APLICADAS COM SUCESSO"
echo "=========================================="
echo ""
echo "  Fixes do script original (1-17):"
echo "   1. prisma/schema.prisma        → url = env(\"DATABASE_URL\") adicionada"
echo "   2. GcsStorageProvider          → uploadBuffer() implementado (versão inicial)"
echo "   3. routes/index.ts             → rotas duplicadas removidas"
echo "   4. app.ts                      → Swagger registrado via setupSwagger()"
echo "   5. FiadoController             → import path corrigido (usecases → useCases)"
echo "   6. useCases/fiadoUseCases.ts   → arquivo criado no path correto"
echo "   7. CategoryRepository          → import path @/modules/services/dtos/ICategoryDTO"
echo "   8. categoryMapper              → import path corrigido"
echo "   9. CategoryController          → criado (service + expense categories)"
echo "  10. categories.routes.ts        → criado e registrado"
echo "  11. api.ts                      → categoriesRoutes registrado"
echo "  12. container/index.ts          → repositórios de categorias registrados no DI"
echo "  13. MockQueueRepository         → AppError em vez de Error genérico"
echo "  14. users.routes.ts             → .bind() adicionado ao handler"
echo "  15. Arquivos .bak               → removidos"
echo "  16. vitest.config.ts            → garantido"
echo "  17. tsconfig.json               → garantido"
echo "  18. scripts/ensure-gcs-key.sh  → criado"
echo ""
echo "  Novos fixes adicionados (18-24):"
echo "  18. prisma/schema.prisma        → BlockedEntity @@unique→@@index (permite re-bloqueio)"
echo "  19. ICategoryRepository.ts      → import com alias @/ em vez de caminho relativo"
echo "  20. fiadoMapper.ts              → Prisma importado de @prisma/client diretamente"
echo "  21. SubscribeUseCase.ts         → cardToken→token, cardInstallments→installments"
echo "  22. ISubscriptionDTO.ts         → campo cardInstallments adicionado"
echo "  23. queue.routes.ts             → /queue/metrics registrado antes de /queue/:id"
echo "  24. GcsStorageProvider          → inicialização lazy (não derruba server sem GCS vars)"
echo ""
echo "Próximos passos:"
echo "  1. npm install               (se ainda não instalou as dependências)"
echo "  2. npx prisma generate       (gerar o client do Prisma)"
echo "  3. npx prisma db push        (aplicar o schema no banco)"
echo "  4. npm run prisma:seed       (popular dados iniciais)"
echo "  5. npm run dev               (subir o servidor)"
echo "  6. npm test                  (rodar os testes)"
echo ""
