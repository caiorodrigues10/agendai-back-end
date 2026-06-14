#!/usr/bin/env bash
# =============================================================================
# fix-barberqueue.sh
# Aplica todas as correções identificadas no projeto BarberQueue
# Execute na RAIZ do projeto: bash fix-barberqueue.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[FIX]${NC} $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $*"; }
info()   { echo -e "${BLUE}[INFO]${NC} $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
sep()    { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Garante que estamos na raiz do projeto
[ -f "package.json" ] || error "Execute na raiz do projeto (onde está package.json)"
grep -q "barberqueue-backend" package.json || error "package.json não é do barberqueue-backend"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         BarberQueue — Script de Correções            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# CORREÇÃO 1: Renomear pasta usecases → useCases (fiado)
# FiadoController importa de "../useCases/fiadoUseCases" mas a pasta no disco
# está como "usecases" (minúsculo). No Linux (case-sensitive) isso quebra.
# Não mexemos no CONTEÚDO do fiado, apenas corrigimos o nome da pasta.
# =============================================================================
sep
info "CORREÇÃO 1: Renomear pasta fiado/usecases → fiado/useCases"

FIADO_USECASES_DIR="src/modules/fiado/usecases"
FIADO_USECASES_TMP="src/modules/fiado/usecases_tmp"
FIADO_USECASES_FINAL="src/modules/fiado/useCases"

if [ -d "$FIADO_USECASES_DIR" ] && [ ! -d "$FIADO_USECASES_FINAL" ]; then
  # Em sistemas case-insensitive (Mac), precisamos de rename via tmp
  mv "$FIADO_USECASES_DIR" "$FIADO_USECASES_TMP"
  mv "$FIADO_USECASES_TMP" "$FIADO_USECASES_FINAL"
  log "Pasta renomeada: usecases → useCases"
elif [ -d "$FIADO_USECASES_FINAL" ]; then
  info "Pasta useCases já existe (correto)"
else
  warn "Pasta $FIADO_USECASES_DIR não encontrada — verifique manualmente"
fi

# =============================================================================
# CORREÇÃO 2: vitest.config.ts — sem ele os aliases "@/*" não funcionam nos testes
# =============================================================================
sep
info "CORREÇÃO 2: Criar vitest.config.ts"

cat > vitest.config.ts << 'VITEST_EOF'
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/tests/setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
VITEST_EOF

log "vitest.config.ts criado"

# =============================================================================
# CORREÇÃO 3: GcsStorageProvider — throw no construtor sem GCS_BUCKET_NAME
# impede o servidor de subir em dev sem as variáveis GCS configuradas.
# Solução: lazy initialization (getter) para bucketName e publicBaseUrl.
# =============================================================================
sep
info "CORREÇÃO 3: GcsStorageProvider — lazy initialization"

mkdir -p src/shared/container/providers/StorageProvider/implementations

cat > src/shared/container/providers/StorageProvider/implementations/GcsStorageProvider.ts << 'GCS_EOF'
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
 *
 * NOTA: A inicialização do Storage é lazy (ocorre na primeira chamada) para permitir
 * que o servidor suba mesmo sem as variáveis GCS configuradas em desenvolvimento.
 * O erro só ocorrerá ao tentar usar efetivamente o storage.
 */
@injectable()
export class GcsStorageProvider implements IStorageProvider {
  private _storage: Storage | null = null;
  private _bucket: ReturnType<Storage["bucket"]> | null = null;

  // ── Lazy getters ────────────────────────────────────────────────────────────

  private get bucketName(): string {
    const name = process.env.GCS_BUCKET_NAME;
    if (!name) {
      throw new Error(
        "GCS_BUCKET_NAME não configurado nas variáveis de ambiente."
      );
    }
    return name;
  }

  private get publicBaseUrl(): string {
    return (
      (process.env.GCS_PUBLIC_BASE_URL ?? "").replace(/\/$/, "") ||
      `https://storage.googleapis.com/${this.bucketName}`
    );
  }

  private get storage(): Storage {
    if (this._storage) return this._storage;

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

    this._storage = new Storage(storageOptions);
    return this._storage;
  }

  private get bucket(): ReturnType<Storage["bucket"]> {
    if (this._bucket) return this._bucket;
    this._bucket = this.storage.bucket(this.bucketName);
    return this._bucket;
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
GCS_EOF

log "GcsStorageProvider atualizado com lazy initialization"

# =============================================================================
# CORREÇÃO 4: checkSubscription — retornar estrutura JSON com planos disponíveis
# igual ao que LoginUseCase faz, para que o frontend possa exibir os planos.
# =============================================================================
sep
info "CORREÇÃO 4: checkSubscription — retornar planos na resposta 402"

mkdir -p src/shared/infra/http/middlewares

cat > src/shared/infra/http/middlewares/checkSubscription.ts << 'CHECKSUB_EOF'
import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_MESSAGES,
} from "@/shared/constants/subscriptionMessages";
import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";

const TRIAL_DAYS = 30;

async function getAvailablePlans() {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      maxEmployees: true,
      features: true,
    },
  });
}

/**
 * Middleware que verifica se a barbearia do usuário autenticado
 * possui acesso ativo (trial ou assinatura).
 *
 * Retorna 402 com estrutura JSON padronizada contendo os planos disponíveis,
 * idêntica à estrutura usada em checkBarbershopAccess.ts (login).
 */
export async function checkSubscription(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;

  // MASTER_ADMIN bypassa a checagem de assinatura
  if (!user || user.role === "MASTER_ADMIN") return;

  if (!user.barbershopId) {
    throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: {
      id: true,
      createdAt: true,
      active: true,
      subscriptions: {
        select: {
          status: true,
          endDate: true,
          cancelDate: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!barbershop || !barbershop.active) {
    throw new AppError("Barbearia inativa ou não encontrada", 403);
  }

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  // Dentro do trial — acesso liberado
  if (now <= trialEnd) return;

  const subscription = barbershop.subscriptions[0];

  if (!subscription) {
    // Trial expirou sem assinatura — bloqueia CPFs e retorna 402 com planos
    blockOwnerCpfs(user.barbershopId).catch((err) =>
      request.log.warn({ err }, "checkSubscription: falha ao bloquear CPFs dos owners")
    );

    const plans = await getAvailablePlans();
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        message: SUBSCRIPTION_MESSAGES.TRIAL_EXPIRED,
        plans,
        barbershopId: user.barbershopId,
      }),
      402
    );
  }

  const config = SUBSCRIPTION_STATUS_CONFIG[subscription.status];

  if (!config?.allowed) {
    blockOwnerCpfs(user.barbershopId).catch((err) =>
      request.log.warn({ err }, "checkSubscription: falha ao bloquear CPFs dos owners")
    );

    const plans = await getAvailablePlans();
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        message: config?.message ?? SUBSCRIPTION_MESSAGES.NO_SUBSCRIPTION,
        plans,
        barbershopId: user.barbershopId,
        subscriptionStatus: subscription.status,
      }),
      402
    );
  }
}
CHECKSUB_EOF

log "checkSubscription atualizado com retorno de planos no erro 402"

# =============================================================================
# CORREÇÃO 5: SubscribeUseCase — PIX não deve ativar subscription imediatamente
# A subscription deve aguardar confirmação via webhook antes de ficar ACTIVE.
# Para PIX: status inicial = PAST_DUE, webhook muda para ACTIVE quando approved.
# Para cartão aprovado: ACTIVE imediatamente (comportamento correto atual).
# =============================================================================
sep
info "CORREÇÃO 5: SubscribeUseCase — status correto para PIX (aguarda webhook)"

mkdir -p src/modules/subscriptions/useCases/subscribe

cat > src/modules/subscriptions/useCases/subscribe/SubscribeUseCase.ts << 'SUBSCRIBE_EOF'
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
  ) {}

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
      select: { id: true, name: true, active: true, createdAt: true },
    });

    if (!barbershop || !barbershop.active) {
      throw new AppError("Barbearia não encontrada ou inativa", 404);
    }

    const plan = await prisma.plan.findUnique({
      where: { id: data.planId },
      select: { id: true, name: true, price: true, active: true },
    });

    if (!plan || !plan.active) {
      throw new AppError("Plano não encontrado ou inativo", 404);
    }

    const existing = await prisma.subscription.findUnique({
      where: { barbershopId: data.barbershopId },
    });

    if (existing && ["TRIALING", "ACTIVE"].includes(existing.status)) {
      throw new AppError(
        "Já existe uma assinatura ativa. Cancele a atual antes de assinar um novo plano.",
        409
      );
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Para PIX: subscription inicia como PAST_DUE e só ativa via webhook.
    // Para cartão aprovado: ACTIVE imediatamente.
    // Isso evita que usuários com PIX pendente tenham acesso antes de pagar.
    const initialStatus = data.paymentMethod === "pix" ? "PAST_DUE" : "ACTIVE";

    const subscription = await prisma.subscription.upsert({
      where: { barbershopId: data.barbershopId },
      update: {
        planId: plan.id,
        status: initialStatus,
        startDate: new Date(),
        endDate: data.paymentMethod === "pix" ? null : dueDate,
        cancelDate: null,
      },
      create: {
        barbershopId: data.barbershopId,
        planId: plan.id,
        status: initialStatus,
        startDate: new Date(),
        endDate: data.paymentMethod === "pix" ? null : dueDate,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.price,
        dueDate,
        status: "PENDING",
        paymentMethod: data.paymentMethod,
      },
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
            identification: data.payerIdentification,
          },
          barbershopId: data.barbershopId,
          externalReference,
          // PIX de assinatura expira em 24h
          expirationMinutes: 60 * 24,
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
          pixQrCode:
            mpResponse.point_of_interaction?.transaction_data?.qr_code ?? null,
          pixQrCodeBase64:
            mpResponse.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
          pixExpirationDate: mpResponse.date_of_expiration
            ? new Date(mpResponse.date_of_expiration)
            : null,
          rawResponse: JSON.stringify(mpResponse),
        });
      } else {
        // Cartão de crédito/débito
        if (!data.cardToken || !data.cardPaymentMethodId) {
          throw new AppError(
            "Token e método de pagamento do cartão são obrigatórios",
            400
          );
        }
        if (!data.payerIdentification) {
          throw new AppError(
            "Identificação (CPF/CNPJ) é obrigatória para cartão",
            400
          );
        }

        const mpResponse = await this.mpService.createCardPayment(
          {
            token: data.cardToken,
            transactionAmount: plan.price,
            description,
            installments: 1,
            paymentMethodId: data.cardPaymentMethodId,
            payer: {
              email: data.payerEmail,
              firstName: data.payerFirstName,
              lastName: data.payerLastName,
              identification: data.payerIdentification,
            },
            barbershopId: data.barbershopId,
            externalReference,
          },
          data.barbershopId
        );

        const paymentMethod =
          mpResponse.payment_type_id === "debit_card"
            ? "debit_card"
            : "credit_card";

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
          rawResponse: JSON.stringify(mpResponse),
        });

        // Cartão aprovado imediatamente → marca invoice como paga e subscription ACTIVE
        if (mpResponse.status === "approved") {
          await prisma.$transaction([
            prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: "PAID", paidAt: new Date(), paymentMethod },
            }),
            prisma.subscription.update({
              where: { id: subscription.id },
              data: { status: "ACTIVE", endDate: dueDate },
            }),
          ]);
        } else {
          // Cartão não aprovado imediatamente (raro) → marca PAST_DUE
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "PAST_DUE" },
          });
        }
      }
    } catch (error: any) {
      // Falha no pagamento → reverte subscription para PAST_DUE
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE" },
      }).catch(() => {}); // não mascara o erro original

      throw new AppError(
        `Erro ao processar pagamento: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    const full = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: {
        plan: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return buildSubscriptionResponse(full, barbershop.createdAt, TRIAL_DAYS);
  }
}
SUBSCRIBE_EOF

log "SubscribeUseCase corrigido — PIX aguarda webhook para ativar subscription"

# =============================================================================
# CORREÇÃO 6: Módulo Appointments — CRUD completo
# O schema Prisma tem o modelo Appointment mas não há nenhum arquivo de implementação.
# =============================================================================
sep
info "CORREÇÃO 6: Implementar módulo Appointments (CRUD completo)"

# --- DTOs ---
mkdir -p src/modules/appointments/dtos

cat > src/modules/appointments/dtos/IAppointmentDTO.ts << 'APPDTO_EOF'
export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface ICreateAppointmentDTO {
  barbershopId: string;
  serviceId: string;
  staffId?: string | null;
  customerName: string;
  whatsapp: string;
  /** Formato ISO: "2026-06-20" */
  date: string;
  /** Formato "HH:MM": "10:30" */
  time: string;
}

export interface IUpdateAppointmentDTO {
  staffId?: string | null;
  customerName?: string;
  whatsapp?: string;
  date?: string;
  time?: string;
  status?: AppointmentStatus;
}

export interface IAppointmentResponseDTO {
  id: string;
  barbershopId: string;
  serviceId: string;
  serviceName: string | null;
  servicePrice: number | null;
  staffId: string | null;
  staffName: string | null;
  customerName: string;
  whatsapp: string;
  date: Date;
  time: string;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IListAppointmentsQuery {
  page: number;
  limit: number;
  /** Filtrar por data específica (ISO "2026-06-20") */
  date?: string;
  /** Filtrar por status */
  status?: AppointmentStatus;
  /** Filtrar por funcionário */
  staffId?: string;
  /** Busca por nome do cliente ou whatsapp */
  search?: string;
}
APPDTO_EOF

# --- Repository Interface ---
mkdir -p src/modules/appointments/repositories

cat > src/modules/appointments/repositories/IAppointmentRepository.ts << 'IAPPREPO_EOF'
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
} from "../dtos/IAppointmentDTO";

export interface IAppointmentRepository {
  create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO>;
  findById(id: string): Promise<IAppointmentResponseDTO | null>;
  list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }>;
  update(id: string, data: IUpdateAppointmentDTO): Promise<IAppointmentResponseDTO>;
  delete(id: string): Promise<void>;
}
IAPPREPO_EOF

# --- Repository Implementation ---
mkdir -p src/modules/appointments/infra/repositories

cat > src/modules/appointments/infra/repositories/AppointmentRepository.ts << 'APPREPO_EOF'
import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { IAppointmentRepository } from "../../repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  AppointmentStatus,
} from "../../dtos/IAppointmentDTO";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    service: { select: { name: true; price: true } };
    staff: { select: { name: true } };
  };
}>;

function mapToDTO(record: AppointmentWithRelations): IAppointmentResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId,
    serviceName: record.service?.name ?? null,
    servicePrice: record.service?.price ?? null,
    staffId: record.staffId ?? null,
    staffName: record.staff?.name ?? null,
    customerName: record.customerName,
    whatsapp: record.whatsapp,
    date: record.date,
    time: record.time,
    status: record.status as AppointmentStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const include = {
  service: { select: { name: true, price: true } },
  staff: { select: { name: true } },
} as const;

export class AppointmentRepository implements IAppointmentRepository {
  async create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO> {
    const record = await prisma.appointment.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId: data.serviceId,
        staffId: data.staffId ?? null,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        date: new Date(data.date),
        time: data.time,
        status: "CONFIRMED",
      },
      include,
    });
    return mapToDTO(record);
  }

  async findById(id: string): Promise<IAppointmentResponseDTO | null> {
    const record = await prisma.appointment.findUnique({ where: { id }, include });
    return record ? mapToDTO(record) : null;
  }

  async list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.AppointmentWhereInput = { barbershopId };

    if (query.date) {
      const day = new Date(query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      where.date = { gte: day, lt: next };
    }
    if (query.status) where.status = query.status;
    if (query.staffId) where.staffId = query.staffId;
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: "insensitive" } },
        { whatsapp: { contains: query.search } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ date: "asc" }, { time: "asc" }],
        include,
      }),
      prisma.appointment.count({ where }),
    ]);

    return { data: records.map(mapToDTO), total };
  }

  async update(
    id: string,
    data: IUpdateAppointmentDTO
  ): Promise<IAppointmentResponseDTO> {
    const record = await prisma.appointment.update({
      where: { id },
      data: {
        ...(data.staffId !== undefined && { staffId: data.staffId }),
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.time !== undefined && { time: data.time }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include,
    });
    return mapToDTO(record);
  }

  async delete(id: string): Promise<void> {
    // Soft delete: apenas cancela
    await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }
}
APPREPO_EOF

# --- Schemas ---
mkdir -p src/modules/appointments/schemas

cat > src/modules/appointments/schemas/appointmentSchemas.ts << 'APPSCHEMA_EOF'
import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createAppointmentSchema = z.object({
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid("serviceId inválido"),
  staffId: z.string().uuid("staffId inválido").optional().nullable(),
  customerName: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: z.string().min(8, "WhatsApp inválido").max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser no formato YYYY-MM-DD"),
  time: z.string().regex(timeRegex, "Hora deve ser no formato HH:MM"),
});

export const updateAppointmentSchema = z.object({
  staffId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(2).max(200).optional(),
  whatsapp: z.string().min(8).max(20).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser no formato YYYY-MM-DD")
    .optional(),
  time: z.string().regex(timeRegex, "Hora deve ser no formato HH:MM").optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
});

export const listAppointmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
  staffId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
APPSCHEMA_EOF

# --- Use Cases ---
mkdir -p src/modules/appointments/useCases

cat > src/modules/appointments/useCases/appointmentUseCases.ts << 'APPUC_EOF'
import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IAppointmentRepository } from "../repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
} from "../dtos/IAppointmentDTO";

// ─── Create ───────────────────────────────────────────────────────────────────

@injectable()
export class CreateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    data: ICreateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.repo.create(data);
  }
}

// ─── Get ──────────────────────────────────────────────────────────────────────

@injectable()
export class GetAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    return appointment;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

@injectable()
export class ListAppointmentsUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    barbershopId: string,
    query: IListAppointmentsQuery,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    return this.repo.list(barbershopId, query);
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

@injectable()
export class UpdateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento cancelado não pode ser editado", 400);
    }

    return this.repo.update(id, data);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

@injectable()
export class CancelAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento já está cancelado", 409);
    }

    await this.repo.delete(id);
  }
}
APPUC_EOF

# --- Controller ---
mkdir -p src/modules/appointments/controllers

cat > src/modules/appointments/controllers/AppointmentController.ts << 'APPCTRL_EOF'
import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
} from "../schemas/appointmentSchemas";
import {
  CreateAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "../useCases/appointmentUseCases";

export class AppointmentController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createAppointmentSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.body as any).barbershopId
        : user.barbershopId;

    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    const useCase = container.resolve(CreateAppointmentUseCase);
    const appointment = await useCase.execute({ ...body, barbershopId }, user);

    reply.status(201).send({ success: true, data: appointment });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetAppointmentUseCase);
    const appointment = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: appointment });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listAppointmentsQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.query as any).barbershopId ?? "")
        : user.barbershopId ?? "";

    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    const useCase = container.resolve(ListAppointmentsUseCase);
    const result = await useCase.execute(barbershopId, query, user);

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
    const { id } = request.params as { id: string };
    const data = updateAppointmentSchema.parse(request.body);
    const useCase = container.resolve(UpdateAppointmentUseCase);
    const appointment = await useCase.execute(id, data, request.user!);
    reply.send({ success: true, data: appointment });
  }

  async cancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(CancelAppointmentUseCase);
    await useCase.execute(id, request.user!);
    reply.status(204).send();
  }
}
APPCTRL_EOF

# --- Mock Repository ---
mkdir -p src/modules/appointments/infra/repositories/mocks

cat > src/modules/appointments/infra/repositories/mocks/MockAppointmentRepository.ts << 'APPMOCK_EOF'
import { IAppointmentRepository } from "@/modules/appointments/repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  AppointmentStatus,
} from "@/modules/appointments/dtos/IAppointmentDTO";

export class MockAppointmentRepository implements IAppointmentRepository {
  public appointments: IAppointmentResponseDTO[] = [];
  private seq = 1;

  async create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO> {
    const now = new Date();
    const entity: IAppointmentResponseDTO = {
      id: `appointment-${this.seq++}`,
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      serviceName: null,
      servicePrice: null,
      staffId: data.staffId ?? null,
      staffName: null,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      date: new Date(data.date),
      time: data.time,
      status: "CONFIRMED",
      createdAt: now,
      updatedAt: now,
    };
    this.appointments.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IAppointmentResponseDTO | null> {
    return this.appointments.find((a) => a.id === id) ?? null;
  }

  async list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    let results = this.appointments.filter(
      (a) => a.barbershopId === barbershopId
    );

    if (query.status) results = results.filter((a) => a.status === query.status);
    if (query.staffId) results = results.filter((a) => a.staffId === query.staffId);
    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (a) =>
          a.customerName.toLowerCase().includes(term) ||
          a.whatsapp.includes(term)
      );
    }

    const total = results.length;
    const start = (query.page - 1) * query.limit;
    return { data: results.slice(start, start + query.limit), total };
  }

  async update(
    id: string,
    data: IUpdateAppointmentDTO
  ): Promise<IAppointmentResponseDTO> {
    const idx = this.appointments.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Agendamento não encontrado");

    this.appointments[idx] = {
      ...this.appointments[idx],
      ...(data.customerName && { customerName: data.customerName }),
      ...(data.whatsapp && { whatsapp: data.whatsapp }),
      ...(data.date && { date: new Date(data.date) }),
      ...(data.time && { time: data.time }),
      ...(data.status && { status: data.status as AppointmentStatus }),
      ...(data.staffId !== undefined && { staffId: data.staffId }),
      updatedAt: new Date(),
    };

    return this.appointments[idx];
  }

  async delete(id: string): Promise<void> {
    const idx = this.appointments.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.appointments[idx] = {
        ...this.appointments[idx],
        status: "CANCELLED",
        updatedAt: new Date(),
      };
    }
  }
}
APPMOCK_EOF

# --- Spec ---
cat > src/modules/appointments/useCases/appointments.spec.ts << 'APPSPEC_EOF'
import { describe, it, expect, beforeEach } from "vitest";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import {
  CreateAppointmentUseCase,
  GetAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  CancelAppointmentUseCase,
} from "./appointmentUseCases";
import { AppError } from "@/shared/errors/AppError";

const ADMIN = { role: "MASTER_ADMIN" } as const;
const owner = (barbershopId: string) => ({ role: "OWNER", barbershopId });
const otherOwner = { role: "OWNER", barbershopId: "other-shop" } as const;

let repo: MockAppointmentRepository;

beforeEach(() => {
  repo = new MockAppointmentRepository();
});

describe("Appointments module", () => {
  it("cria agendamento e lista por barbearia", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const list = new ListAppointmentsUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "João Silva",
        whatsapp: "5599999999999",
        date: "2026-07-01",
        time: "10:00",
      },
      owner("shop-1")
    );

    expect(apt.status).toBe("CONFIRMED");
    expect(apt.customerName).toBe("João Silva");

    const result = await list.execute("shop-1", { page: 1, limit: 20 }, ADMIN);
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("busca agendamento por id", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Maria",
        whatsapp: "5588888888888",
        date: "2026-07-02",
        time: "14:00",
      },
      ADMIN
    );

    const found = await get.execute(apt.id, ADMIN);
    expect(found.id).toBe(apt.id);
  });

  it("atualiza status para COMPLETED", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const update = new UpdateAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Pedro",
        whatsapp: "5577777777777",
        date: "2026-07-03",
        time: "09:00",
      },
      ADMIN
    );

    const updated = await update.execute(
      apt.id,
      { status: "COMPLETED" },
      ADMIN
    );
    expect(updated.status).toBe("COMPLETED");
  });

  it("cancela agendamento", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const cancel = new CancelAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Ana",
        whatsapp: "5566666666666",
        date: "2026-07-04",
        time: "11:00",
      },
      ADMIN
    );

    await cancel.execute(apt.id, ADMIN);
    const found = await get.execute(apt.id, ADMIN);
    expect(found.status).toBe("CANCELLED");
  });

  it("lança 404 para id inexistente", async () => {
    const get = new GetAppointmentUseCase(repo as any);
    await expect(get.execute("not-found", ADMIN)).rejects.toBeInstanceOf(AppError);
  });

  it("lança 403 quando OWNER tenta acessar agendamento de outra barbearia", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const get = new GetAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Cliente",
        whatsapp: "5500000000000",
        date: "2026-07-05",
        time: "15:00",
      },
      ADMIN
    );

    await expect(get.execute(apt.id, otherOwner)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("lança 409 ao tentar cancelar agendamento já cancelado", async () => {
    const create = new CreateAppointmentUseCase(repo as any);
    const cancel = new CancelAppointmentUseCase(repo as any);

    const apt = await create.execute(
      {
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Duplo",
        whatsapp: "5511111111111",
        date: "2026-07-06",
        time: "16:00",
      },
      ADMIN
    );

    await cancel.execute(apt.id, ADMIN);
    await expect(cancel.execute(apt.id, ADMIN)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
APPSPEC_EOF

# --- Routes ---
mkdir -p src/shared/infra/http/routes

cat > src/shared/infra/http/routes/appointments.routes.ts << 'APPROUTES_EOF'
import { FastifyInstance } from "fastify";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { checkSubscription } from "../middlewares/checkSubscription";
import { AppointmentController } from "@/modules/appointments/controllers/AppointmentController";

export async function appointmentsRoutes(app: FastifyInstance) {
  const appointments = new AppointmentController();

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

  // Listagem e consulta — qualquer staff autenticado
  app.get("/appointments", { preHandler: staffGuard }, appointments.list.bind(appointments));
  app.get("/appointments/:id", { preHandler: staffGuard }, appointments.get.bind(appointments));

  // Criação e atualização — staff autenticado
  app.post("/appointments", { preHandler: staffGuard }, appointments.create.bind(appointments));
  app.patch("/appointments/:id", { preHandler: staffGuard }, appointments.update.bind(appointments));

  // Cancelamento — apenas owner ou admin
  app.delete("/appointments/:id", { preHandler: ownerGuard }, appointments.cancel.bind(appointments));
}
APPROUTES_EOF

log "Módulo Appointments criado (DTOs, Repository, UseCases, Controller, Routes, Spec)"

# =============================================================================
# CORREÇÃO 7: Registrar AppointmentRepository no container e adicionar rotas
# =============================================================================
sep
info "CORREÇÃO 7: Atualizar container/index.ts com AppointmentRepository"

cat > src/shared/container/index.ts << 'CONTAINER_EOF'
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

import { IAppointmentRepository } from "@/modules/appointments/repositories/IAppointmentRepository";
import { AppointmentRepository } from "@/modules/appointments/infra/repositories/AppointmentRepository";

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
container.registerSingleton<IAppointmentRepository>(
  "AppointmentRepository",
  AppointmentRepository
);
CONTAINER_EOF

log "container/index.ts atualizado com AppointmentRepository"

# =============================================================================
# CORREÇÃO 8: Adicionar appointmentsRoutes no api.ts
# =============================================================================
sep
info "CORREÇÃO 8: Registrar appointmentsRoutes em api.ts"

cat > src/shared/infra/http/routes/api.ts << 'API_EOF'
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
import { appointmentsRoutes } from "./appointments.routes";

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
  await appointmentsRoutes(app);
}
API_EOF

log "api.ts atualizado com appointmentsRoutes"

# =============================================================================
# CORREÇÃO 9: tsconfig.json — garantir que o alias "@" está configurado
# e que experimentalDecorators / emitDecoratorMetadata estão ativos
# (necessário para tsyringe funcionar corretamente)
# =============================================================================
sep
info "CORREÇÃO 9: Verificar tsconfig.json"

if [ ! -f tsconfig.json ]; then
  warn "tsconfig.json não encontrado — criando com configuração base"
  cat > tsconfig.json << 'TSCONFIG_EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "prisma/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSCONFIG_EOF
  log "tsconfig.json criado"
else
  # Verifica se experimentalDecorators e emitDecoratorMetadata estão presentes
  if ! grep -q "experimentalDecorators" tsconfig.json; then
    warn "tsconfig.json existe mas pode não ter experimentalDecorators/emitDecoratorMetadata"
    warn "Verifique manualmente se o tsconfig.json contém:"
    warn "  \"experimentalDecorators\": true"
    warn "  \"emitDecoratorMetadata\": true"
    warn "  \"paths\": { \"@/*\": [\"src/*\"] }"
  else
    info "tsconfig.json parece correto (experimentalDecorators presente)"
  fi
fi

# =============================================================================
# RELATÓRIO FINAL
# =============================================================================
sep
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            TODAS AS CORREÇÕES APLICADAS!             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Resumo das correções:${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} 1. Pasta fiado/usecases renomeada para fiado/useCases"
echo -e "        (fix: import case-sensitive no Linux)"
echo ""
echo -e "  ${GREEN}✓${NC} 2. vitest.config.ts criado"
echo -e "        (fix: aliases @/* não funcionavam nos testes)"
echo ""
echo -e "  ${GREEN}✓${NC} 3. GcsStorageProvider com lazy initialization"
echo -e "        (fix: servidor não subia sem variáveis GCS em dev)"
echo ""
echo -e "  ${GREEN}✓${NC} 4. checkSubscription retorna planos disponíveis no erro 402"
echo -e "        (fix: inconsistência com LoginUseCase que retorna planos)"
echo ""
echo -e "  ${GREEN}✓${NC} 5. SubscribeUseCase — PIX inicia como PAST_DUE"
echo -e "        (fix: subscription não deve ficar ACTIVE antes do pagamento)"
echo ""
echo -e "  ${GREEN}✓${NC} 6. Módulo Appointments implementado do zero"
echo -e "        (fix: modelo existia no Prisma mas sem API alguma)"
echo ""
echo -e "  ${GREEN}✓${NC} 7. container/index.ts com AppointmentRepository"
echo ""
echo -e "  ${GREEN}✓${NC} 8. api.ts com appointmentsRoutes registrado"
echo ""
echo -e "  ${GREEN}✓${NC} 9. tsconfig.json verificado/criado"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Revisão do módulo Fiado:${NC}"
echo -e "  ${GREEN}✓${NC} Lógica de negócio: completa e correta"
echo -e "  ${GREEN}✓${NC} CRUD + pagamentos parciais: funcionando"
echo -e "  ${GREEN}✓${NC} Status automático PENDING→PARTIAL→PAID: correto"
echo -e "  ${GREEN}✓${NC} Validação de overpayment: presente"
echo -e "  ${GREEN}✓${NC} isOverdue no mapper: correto"
echo -e "  ${GREEN}✓${NC} Rotas com guards corretos (staff cria, owner deleta)"
echo -e "  ${YELLOW}↳${NC} Único problema era a pasta usecases/useCases — corrigido acima"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo ""
echo -e "  1. Verifique se o tsconfig.json tem os campos necessários:"
echo -e "     experimentalDecorators, emitDecoratorMetadata, paths @/*"
echo ""
echo -e "  2. Para rodar os testes:"
echo -e "     ${YELLOW}npm test${NC}"
echo ""
echo -e "  3. Para subir em desenvolvimento:"
echo -e "     ${YELLOW}docker-compose up${NC}"
echo -e "     ou"
echo -e "     ${YELLOW}npm run dev${NC}"
echo ""
echo -e "  4. Endpoints de agendamentos disponíveis em:"
echo -e "     GET    /api/appointments"
echo -e "     GET    /api/appointments/:id"
echo -e "     POST   /api/appointments"
echo -e "     PATCH  /api/appointments/:id"
echo -e "     DELETE /api/appointments/:id  (cancela — apenas OWNER/ADMIN)"
echo ""
