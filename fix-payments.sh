#!/usr/bin/env bash
# =============================================================================
# fix-payments-2.sh — BarberQueue Payment Module — Round 2 Fixes
# =============================================================================
# Aplica as 4 correções identificadas após o primeiro script.
# DEVE ser executado APÓS fix-payments.sh.
# Execute a partir da raiz do projeto: bash fix-payments-2.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_step()  { echo -e "\n${BLUE}${BOLD}▶ $1${NC}"; }
log_ok()    { echo -e "  ${GREEN}✔ $1${NC}"; }
log_warn()  { echo -e "  ${YELLOW}⚠ $1${NC}"; }
log_error() { echo -e "  ${RED}✖ $1${NC}"; }

if [[ ! -f "prisma/schema.prisma" ]]; then
  log_error "Execute o script a partir da raiz do projeto (onde está prisma/schema.prisma)."
  exit 1
fi

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     BarberQueue — Payment Fixes Round 2 (4 correções)       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  [FIX-1] CancelPaymentUseCase — tratar 'já cancelado' como sucesso"
echo "          (evita 400 por race condition com webhook)"
echo ""
echo "  [FIX-2] paymentSchemas.ts — substituir .multipleOf(0.01) por"
echo "          .refine() com arredondamento (evita rejeitar R\$ 49,99)"
echo ""
echo "  [FIX-3] ListPaymentsController — MASTER_ADMIN sem barbershopId"
echo "          na query lista todos os pagamentos em vez de retornar 400"
echo ""
echo "  [FIX-4] MercadoPagoService.getPaymentById — aceitar string para"
echo "          manter consistência após fix do mpPaymentId BigInt→string"
echo ""
read -r -p "  Continuar? [s/N] " confirm
[[ "$confirm" =~ ^[Ss]$ ]] || { echo "Abortado."; exit 0; }

# =============================================================================
# FIX-1: CancelPaymentUseCase — tratar "já cancelado" como sucesso
# =============================================================================
log_step "[FIX-1] Corrigindo CancelPaymentUseCase"

cat > src/modules/payments/useCases/cancelPayment/CancelPaymentUseCase.ts << 'EOF'
import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CancelPaymentUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(id: string): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    // Se já está cancelado (ex.: webhook chegou antes desta chamada),
    // retorna idempotentemente sem tentar cancelar de novo no MP.
    // Isso evita erros 400 por race condition entre webhook e chamada manual.
    if (payment.status === "cancelled") {
      return payment;
    }

    const cancellableStatuses = ["pending", "in_process", "authorized"];
    if (!cancellableStatuses.includes(payment.status)) {
      throw new AppError(
        `Pagamento com status "${payment.status}" não pode ser cancelado`,
        400
      );
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["cancelPayment"]>>;

    try {
      mpResponse = await this.mpService.cancelPayment(Number(payment.mpPaymentId));
    } catch (error: any) {
      throw new AppError(
        `Erro ao cancelar no Mercado Pago: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    // Se o MP também reportou "cancelled", persiste e retorna
    return this.paymentRepo.updateStatus(payment.id, {
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      rawResponse: JSON.stringify(mpResponse)
    });
  }
}
EOF
log_ok "CancelPaymentUseCase.ts corrigido"

# =============================================================================
# FIX-2: paymentSchemas.ts — trocar .multipleOf(0.01) por .refine()
# =============================================================================
log_step "[FIX-2] Corrigindo validação de transactionAmount em paymentSchemas.ts"

cat > src/modules/payments/schemas/paymentSchemas.ts << 'EOF'
import { z } from "zod";

const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"]),
  number: z
    .string()
    .min(11, "CPF deve ter 11 dígitos ou CNPJ 14 dígitos")
    .max(14)
    .regex(/^\d+$/, "Apenas números são aceitos")
});

const cardPayerSchema = z.object({
  email: z.string().email("E-mail inválido"),
  identification: identificationSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

const billingAddressSchema = z.object({
  zipCode: z.string().min(8).max(9),
  streetName: z.string().min(1),
  streetNumber: z.string().min(1),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  federalUnit: z.string().length(2).optional()
});

// FIX-2: .multipleOf(0.01) falha para valores como 49.99 por imprecisão
// de ponto flutuante em JS (49.99 % 0.01 !== 0 em binário).
// Solução: validar que o valor tem no máximo 2 casas decimais via refine().
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value ||
    Number(value.toFixed(2)) === value;
}

const transactionAmountSchema = z
  .number()
  .positive("Valor deve ser positivo")
  .refine(hasAtMostTwoDecimals, {
    message: "Valor deve ter no máximo 2 casas decimais"
  });

export const createCardPaymentSchema = z.object({
  token: z.string().min(1, "Token do cartão é obrigatório"),
  transactionAmount: transactionAmountSchema,
  description: z.string().min(1).max(256),
  installments: z.number().int().min(1).max(12),
  paymentMethodId: z.string().min(1, "Método de pagamento obrigatório"),
  issuerId: z.string().optional(),
  payer: cardPayerSchema,
  billingAddress: billingAddressSchema.optional(),
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  queueItemId: z.string().uuid().optional(),
  externalReference: z.string().max(64).optional()
});

export const createPixPaymentSchema = z.object({
  transactionAmount: transactionAmountSchema,
  description: z.string().min(1).max(256),
  payer: z.object({
    email: z.string().email("E-mail inválido"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    identification: identificationSchema.optional()
  }),
  barbershopId: z.string().uuid("barbershopId inválido"),
  serviceId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  queueItemId: z.string().uuid().optional(),
  externalReference: z.string().max(64).optional(),
  expirationMinutes: z.number().int().min(5).max(1440).default(30)
});

export const getPaymentStatusSchema = z.object({
  id: z.string().uuid("ID inválido")
});

export type CreateCardPaymentInput = z.infer<typeof createCardPaymentSchema>;
export type CreatePixPaymentInput = z.infer<typeof createPixPaymentSchema>;
EOF
log_ok "paymentSchemas.ts corrigido (.multipleOf → .refine com 2 casas decimais)"

# =============================================================================
# FIX-3: ListPaymentsController — admin sem barbershopId lista tudo
# =============================================================================
log_step "[FIX-3] Corrigindo ListPaymentsController e ListPaymentsUseCase"

cat > src/modules/payments/useCases/listPayments/ListPaymentsUseCase.ts << 'EOF'
import { inject, injectable } from "tsyringe";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";

@injectable()
export class ListPaymentsUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository
  ) {}

  // FIX-3: barbershopId agora é opcional — undefined = listar todos (só para MASTER_ADMIN)
  async execute(
    barbershopId: string | undefined,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number; page: number; limit: number }> {
    const result = await this.paymentRepo.findByBarbershopId(barbershopId, page, limit);
    return { data: result.data, total: result.total, page, limit };
  }
}
EOF
log_ok "ListPaymentsUseCase.ts atualizado"

cat > src/modules/payments/useCases/listPayments/ListPaymentsController.ts << 'EOF'
import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListPaymentsUseCase } from "./ListPaymentsUseCase";
import { AppError } from "@/shared/errors/AppError";

export class ListPaymentsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const {
      barbershopId,
      page = "1",
      limit = "20"
    } = request.query as { barbershopId?: string; page?: string; limit?: string };

    const user = request.user!;

    let resolvedBarbershopId: string | undefined;

    if (user.role === "MASTER_ADMIN") {
      // FIX-3: admin pode passar ?barbershopId= para filtrar uma barbearia específica,
      // ou omitir para listar todos os pagamentos da plataforma
      resolvedBarbershopId = barbershopId; // pode ser undefined — isso é intencional
    } else {
      // Não-admin: obrigatoriamente usa a barbearia do próprio token
      resolvedBarbershopId = user.barbershopId;
      if (!resolvedBarbershopId) {
        throw new AppError(
          "Usuário não está vinculado a nenhuma barbearia",
          400
        );
      }
    }

    const useCase = container.resolve(ListPaymentsUseCase);
    const result = await useCase.execute(
      resolvedBarbershopId,
      Number(page),
      Math.min(Number(limit), 100)
    );

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  }
}
EOF
log_ok "ListPaymentsController.ts corrigido (MASTER_ADMIN sem barbershopId lista tudo)"

# =============================================================================
# FIX-3: IPaymentRepository — findByBarbershopId com barbershopId opcional
# =============================================================================
log_step "[FIX-3] Atualizando IPaymentRepository para suportar listagem global"

cat > src/modules/payments/repositories/IPaymentRepository.ts << 'EOF'
import {
  IPaymentResponseDTO,
  PaymentMethod,
  PaymentStatus
} from "../dtos/IPaymentDTO";

export interface ICreatePaymentRecordDTO {
  mpPaymentId: number | string;
  status: PaymentStatus;
  statusDetail: string;
  paymentMethod: PaymentMethod;
  transactionAmount: number;
  currency: string;
  description: string;
  barbershopId: string;
  serviceId?: string | null;
  appointmentId?: string | null;
  queueItemId?: string | null;
  externalReference?: string | null;
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationDate?: Date | null;
  rawResponse?: string | null;
}

export interface IUpdatePaymentStatusDTO {
  status: PaymentStatus;
  statusDetail: string;
  rawResponse?: string | null;
}

export interface IPaymentRepository {
  create(data: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO>;
  findById(id: string): Promise<IPaymentResponseDTO | null>;
  findByMpPaymentId(mpPaymentId: string): Promise<IPaymentResponseDTO | null>;
  // FIX-3: barbershopId opcional — undefined lista todos os pagamentos (uso exclusivo do MASTER_ADMIN)
  findByBarbershopId(
    barbershopId: string | undefined,
    page?: number,
    limit?: number
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }>;
  updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO>;
}
EOF
log_ok "IPaymentRepository.ts atualizado"

# =============================================================================
# FIX-3: PaymentRepository — findByBarbershopId com filtro opcional
# =============================================================================
log_step "[FIX-3] Atualizando PaymentRepository.findByBarbershopId"

cat > src/modules/payments/infra/repositories/PaymentRepository.ts << 'EOF'
import { prisma } from "@/libs/prismaClient";
import {
  IPaymentRepository,
  ICreatePaymentRecordDTO,
  IUpdatePaymentStatusDTO
} from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO, PaymentStatus } from "../../dtos/IPaymentDTO";

// mpPaymentId é BigInt no banco. Serializamos como string para evitar
// truncamento silencioso de IDs acima de Number.MAX_SAFE_INTEGER (2^53-1).
function mapToDTO(record: any): IPaymentResponseDTO {
  return {
    id: record.id,
    mpPaymentId: record.mpPaymentId.toString(),
    status: record.status as PaymentStatus,
    statusDetail: record.statusDetail,
    paymentMethod: record.paymentMethod,
    transactionAmount: record.transactionAmount,
    currency: record.currency,
    description: record.description,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId ?? null,
    appointmentId: record.appointmentId ?? null,
    queueItemId: record.queueItemId ?? null,
    externalReference: record.externalReference ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pixQrCode: record.pixQrCode
      ? {
          qrCode: record.pixQrCode,
          qrCodeBase64: record.pixQrCodeBase64 ?? "",
          expirationDate: record.pixExpirationDate?.toISOString() ?? ""
        }
      : null
  };
}

const MAX_RAW_RESPONSE_CHARS = 10_000;
function truncateRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length <= MAX_RAW_RESPONSE_CHARS) return raw;
  return raw.slice(0, MAX_RAW_RESPONSE_CHARS) + "...[truncated]";
}

export class PaymentRepository implements IPaymentRepository {
  async create(data: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO> {
    const record = await prisma.payment.create({
      data: {
        mpPaymentId: BigInt(data.mpPaymentId),
        status: data.status,
        statusDetail: data.statusDetail,
        paymentMethod: data.paymentMethod,
        transactionAmount: data.transactionAmount,
        currency: data.currency,
        description: data.description,
        barbershopId: data.barbershopId,
        serviceId: data.serviceId ?? null,
        appointmentId: data.appointmentId ?? null,
        queueItemId: data.queueItemId ?? null,
        externalReference: data.externalReference ?? null,
        pixQrCode: data.pixQrCode ?? null,
        pixQrCodeBase64: data.pixQrCodeBase64 ?? null,
        pixExpirationDate: data.pixExpirationDate ?? null,
        rawResponse: truncateRaw(data.rawResponse)
      }
    });
    return mapToDTO(record);
  }

  async findById(id: string): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({ where: { id } });
    return record ? mapToDTO(record) : null;
  }

  async findByMpPaymentId(mpPaymentId: string): Promise<IPaymentResponseDTO | null> {
    const record = await prisma.payment.findUnique({
      where: { mpPaymentId: BigInt(mpPaymentId) }
    });
    return record ? mapToDTO(record) : null;
  }

  // FIX-3: barbershopId undefined = sem filtro (listagem global para admin)
  async findByBarbershopId(
    barbershopId: string | undefined,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }> {
    const skip = (page - 1) * limit;
    const where = barbershopId ? { barbershopId } : {};
    const [records, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.payment.count({ where })
    ]);
    return { data: records.map(mapToDTO), total };
  }

  async updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO> {
    const record = await prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        statusDetail: data.statusDetail,
        ...(data.rawResponse !== undefined && {
          rawResponse: truncateRaw(data.rawResponse)
        })
      }
    });
    return mapToDTO(record);
  }
}
EOF
log_ok "PaymentRepository.ts atualizado"

# =============================================================================
# FIX-3: MockPaymentRepository — findByBarbershopId com filtro opcional
# =============================================================================
log_step "[FIX-3] Atualizando MockPaymentRepository.findByBarbershopId"

cat > src/modules/payments/infra/repositories/mocks/MockPaymentRepository.ts << 'EOF'
import {
  IPaymentRepository,
  ICreatePaymentRecordDTO,
  IUpdatePaymentStatusDTO
} from "../../../repositories/IPaymentRepository";
import { IPaymentResponseDTO, PaymentStatus } from "../../../dtos/IPaymentDTO";

export class MockPaymentRepository implements IPaymentRepository {
  private data: IPaymentResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreatePaymentRecordDTO): Promise<IPaymentResponseDTO> {
    const now = new Date();
    const entity: IPaymentResponseDTO = {
      id: `payment-${this.seq++}`,
      mpPaymentId: String(payload.mpPaymentId),
      status: payload.status,
      statusDetail: payload.statusDetail,
      paymentMethod: payload.paymentMethod,
      transactionAmount: payload.transactionAmount,
      currency: payload.currency,
      description: payload.description,
      barbershopId: payload.barbershopId,
      serviceId: payload.serviceId ?? null,
      appointmentId: payload.appointmentId ?? null,
      queueItemId: payload.queueItemId ?? null,
      externalReference: payload.externalReference ?? null,
      createdAt: now,
      updatedAt: now,
      pixQrCode: payload.pixQrCode
        ? {
            qrCode: payload.pixQrCode,
            qrCodeBase64: payload.pixQrCodeBase64 ?? "",
            expirationDate: payload.pixExpirationDate?.toISOString() ?? ""
          }
        : null
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IPaymentResponseDTO | null> {
    return this.data.find((p) => p.id === id) ?? null;
  }

  async findByMpPaymentId(mpPaymentId: string): Promise<IPaymentResponseDTO | null> {
    return this.data.find((p) => p.mpPaymentId === String(mpPaymentId)) ?? null;
  }

  // FIX-3: undefined = listar todos
  async findByBarbershopId(
    barbershopId: string | undefined,
    page = 1,
    limit = 20
  ): Promise<{ data: IPaymentResponseDTO[]; total: number }> {
    const filtered = barbershopId
      ? this.data.filter((p) => p.barbershopId === barbershopId)
      : [...this.data];
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      total: filtered.length
    };
  }

  async updateStatus(
    id: string,
    data: IUpdatePaymentStatusDTO
  ): Promise<IPaymentResponseDTO> {
    const idx = this.data.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Payment not found");
    this.data[idx] = {
      ...this.data[idx],
      status: data.status,
      statusDetail: data.statusDetail,
      updatedAt: new Date()
    };
    return this.data[idx];
  }
}
EOF
log_ok "MockPaymentRepository.ts atualizado"

# =============================================================================
# FIX-4: MercadoPagoService — getPaymentById e cancelPayment aceitam string
# =============================================================================
log_step "[FIX-4] Atualizando MercadoPagoService para aceitar string em getPaymentById/cancelPayment"

cat > src/modules/payments/services/MercadoPagoService.ts << 'EOF'
import { injectable } from "tsyringe";
import {
  ICreateCardPaymentDTO,
  ICreatePixPaymentDTO
} from "../dtos/IPaymentDTO";

interface MPPaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  payment_method_id: string;
  payment_type_id: string;
  transaction_amount: number;
  currency_id: string;
  description: string;
  external_reference?: string;
  date_created: string;
  date_last_updated: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  transaction_details?: {
    external_resource_url?: string;
  };
  date_of_expiration?: string;
}

@injectable()
export class MercadoPagoService {
  private readonly baseUrl = "https://api.mercadopago.com";

  // FIX-4 + IMP-3: getter lazy — não lê a env no construtor,
  // então o servidor sobe mesmo sem o token definido
  private get accessToken(): string {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis de ambiente"
      );
    }
    return token;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "X-Product-Id": "barberqueue"
    };

    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const json = await response.json();

    if (!response.ok) {
      const mpError = json as {
        message?: string;
        error?: string;
        cause?: Array<{ code: number; description: string }>;
      };
      const cause = mpError.cause?.map((c) => c.description).join("; ");
      throw new Error(
        `Mercado Pago API error ${response.status}: ${mpError.message || mpError.error}${cause ? " — " + cause : ""}`
      );
    }

    return json as T;
  }

  private idempotencyKey(...parts: string[]): string {
    return parts.join(":") + ":" + Date.now().toString(36);
  }

  async createCardPayment(
    data: ICreateCardPaymentDTO,
    barbershopId: string,
    serviceId?: string,
    appointmentId?: string,
    queueItemId?: string
  ): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference || `bq-${barbershopId}-${Date.now()}`;

    const payload: Record<string, unknown> = {
      transaction_amount: data.transactionAmount,
      token: data.token,
      description: data.description,
      installments: data.installments,
      payment_method_id: data.paymentMethodId,
      issuer_id: data.issuerId,
      external_reference: externalReference,
      payer: {
        email: data.payer.email,
        first_name: data.payer.firstName,
        last_name: data.payer.lastName,
        identification: {
          type: data.payer.identification.type,
          number: data.payer.identification.number
        }
      },
      additional_info: {
        items: [
          {
            id: serviceId || "service",
            title: data.description,
            quantity: 1,
            unit_price: data.transactionAmount
          }
        ]
      },
      metadata: {
        barbershop_id: barbershopId,
        service_id: serviceId,
        appointment_id: appointmentId,
        queue_item_id: queueItemId
      }
    };

    if (data.billingAddress) {
      (payload.payer as Record<string, unknown>)["address"] = {
        zip_code: data.billingAddress.zipCode,
        street_name: data.billingAddress.streetName,
        street_number: data.billingAddress.streetNumber,
        neighborhood: data.billingAddress.neighborhood,
        city: data.billingAddress.city,
        federal_unit: data.billingAddress.federalUnit
      };
    }

    return this.request<MPPaymentResponse>(
      "POST",
      "/v1/payments",
      payload,
      this.idempotencyKey("card", barbershopId, externalReference)
    );
  }

  async createPixPayment(data: ICreatePixPaymentDTO): Promise<MPPaymentResponse> {
    const externalReference =
      data.externalReference || `bq-pix-${data.barbershopId}-${Date.now()}`;

    const expirationDate = new Date(
      Date.now() + (data.expirationMinutes ?? 30) * 60 * 1000
    ).toISOString();

    const payload: Record<string, unknown> = {
      transaction_amount: data.transactionAmount,
      description: data.description,
      payment_method_id: "pix",
      date_of_expiration: expirationDate,
      external_reference: externalReference,
      payer: {
        email: data.payer.email,
        first_name: data.payer.firstName,
        last_name: data.payer.lastName,
        ...(data.payer.identification && {
          identification: {
            type: data.payer.identification.type,
            number: data.payer.identification.number
          }
        })
      },
      additional_info: {
        items: [
          {
            id: data.serviceId || "service",
            title: data.description,
            quantity: 1,
            unit_price: data.transactionAmount
          }
        ]
      },
      metadata: {
        barbershop_id: data.barbershopId,
        service_id: data.serviceId,
        appointment_id: data.appointmentId,
        queue_item_id: data.queueItemId
      }
    };

    return this.request<MPPaymentResponse>(
      "POST",
      "/v1/payments",
      payload,
      this.idempotencyKey("pix", data.barbershopId, externalReference)
    );
  }

  // FIX-4: aceita string para manter consistência com mpPaymentId: string no DTO.
  // A API do MP usa número na URL, então convertemos internamente.
  async getPaymentById(mpPaymentId: string | number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>("GET", `/v1/payments/${mpPaymentId}`);
  }

  async cancelPayment(mpPaymentId: string | number): Promise<MPPaymentResponse> {
    return this.request<MPPaymentResponse>(
      "PUT",
      `/v1/payments/${mpPaymentId}`,
      { status: "cancelled" }
    );
  }
}
EOF
log_ok "MercadoPagoService.ts atualizado (getPaymentById/cancelPayment aceitam string | number)"

# =============================================================================
# FIX-4: GetPaymentStatusUseCase — remover Number() desnecessário
# =============================================================================
log_step "[FIX-4] Atualizando GetPaymentStatusUseCase para passar mpPaymentId direto"

cat > src/modules/payments/useCases/getPaymentStatus/GetPaymentStatusUseCase.ts << 'EOF'
import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO, PaymentStatus } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class GetPaymentStatusUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(
    id: string,
    syncWithMp = false,
    logger?: { warn: (msg: string, ...args: any[]) => void }
  ): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    const shouldSync =
      syncWithMp || ["pending", "in_process"].includes(payment.status);

    if (shouldSync) {
      try {
        // FIX-4: passa string diretamente — sem Number(), sem risco de truncamento
        const mpData = await this.mpService.getPaymentById(payment.mpPaymentId);
        if (mpData.status !== payment.status) {
          return this.paymentRepo.updateStatus(payment.id, {
            status: mpData.status as PaymentStatus,
            statusDetail: mpData.status_detail,
            rawResponse: JSON.stringify(mpData)
          });
        }
      } catch (err: any) {
        // IMP-4: loga em vez de silenciar completamente
        const msg = `[GetPaymentStatus] Falha ao sincronizar mpPaymentId=${payment.mpPaymentId} com Mercado Pago: ${err?.message ?? err}`;
        if (logger) {
          logger.warn(msg);
        } else {
          console.warn(msg);
        }
      }
    }

    return payment;
  }
}
EOF
log_ok "GetPaymentStatusUseCase.ts atualizado (sem Number() no mpPaymentId)"

# =============================================================================
# FIX-4: CancelPaymentUseCase — usar string no cancelPayment
# =============================================================================
log_step "[FIX-4] Atualizando CancelPaymentUseCase para passar mpPaymentId como string"

cat > src/modules/payments/useCases/cancelPayment/CancelPaymentUseCase.ts << 'EOF'
import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CancelPaymentUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(id: string): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    // FIX-1: "cancelled" retorna idempotentemente em vez de 400
    if (payment.status === "cancelled") {
      return payment;
    }

    const cancellableStatuses = ["pending", "in_process", "authorized"];
    if (!cancellableStatuses.includes(payment.status)) {
      throw new AppError(
        `Pagamento com status "${payment.status}" não pode ser cancelado`,
        400
      );
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["cancelPayment"]>>;

    try {
      // FIX-4: passa string diretamente — sem Number()
      mpResponse = await this.mpService.cancelPayment(payment.mpPaymentId);
    } catch (error: any) {
      throw new AppError(
        `Erro ao cancelar no Mercado Pago: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    return this.paymentRepo.updateStatus(payment.id, {
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      rawResponse: JSON.stringify(mpResponse)
    });
  }
}
EOF
log_ok "CancelPaymentUseCase.ts atualizado (FIX-1 + FIX-4 juntos)"

# =============================================================================
# Atualizar payments.spec.ts com testes dos 4 fixes
# =============================================================================
log_step "Atualizando payments.spec.ts com testes dos novos fixes"

cat > src/modules/payments/useCases/payments.spec.ts << 'EOF'
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockPaymentRepository } from "@/modules/payments/infra/repositories/mocks/MockPaymentRepository";
import { CreateCardPaymentUseCase } from "./createCardPayment/CreateCardPaymentUseCase";
import { CreatePixPaymentUseCase } from "./createPixPayment/CreatePixPaymentUseCase";
import { GetPaymentStatusUseCase } from "./getPaymentStatus/GetPaymentStatusUseCase";
import { ListPaymentsUseCase } from "./listPayments/ListPaymentsUseCase";
import { CancelPaymentUseCase } from "./cancelPayment/CancelPaymentUseCase";
import { ProcessWebhookUseCase } from "./processWebhook/ProcessWebhookUseCase";
import { AppError } from "@/shared/errors/AppError";

// ── Mock do MercadoPagoService ───────────────────────────────────────────────
const mockMpCard   = vi.fn();
const mockMpPix    = vi.fn();
const mockMpGet    = vi.fn();
const mockMpCancel = vi.fn();

const mpServiceMock = {
  createCardPayment: mockMpCard,
  createPixPayment: mockMpPix,
  getPaymentById: mockMpGet,
  cancelPayment: mockMpCancel
} as any;

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeMpCardResponse(overrides = {}) {
  return {
    id: 123456,
    status: "approved",
    status_detail: "accredited",
    payment_type_id: "credit_card",
    payment_method_id: "visa",
    transaction_amount: 50,
    currency_id: "BRL",
    description: "Corte",
    external_reference: "ext-ref-1",
    ...overrides
  };
}

function makeMpPixResponse(overrides = {}) {
  return {
    id: 789012,
    status: "pending",
    status_detail: "pending_waiting_transfer",
    payment_type_id: "bank_transfer",
    payment_method_id: "pix",
    transaction_amount: 40,
    currency_id: "BRL",
    description: "Barba",
    external_reference: "ext-pix-1",
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    point_of_interaction: {
      transaction_data: { qr_code: "00020101...", qr_code_base64: "iVBORw0K..." }
    },
    ...overrides
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────
let repo: MockPaymentRepository;

beforeEach(() => {
  repo = new MockPaymentRepository();
  vi.clearAllMocks();
});

// ── Testes ───────────────────────────────────────────────────────────────────

describe("CreateCardPaymentUseCase", () => {
  it("cria pagamento com cartão com sucesso", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const result = await useCase.execute({
      token: "card-token", transactionAmount: 50, description: "Corte",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    expect(result.status).toBe("approved");
    expect(result.paymentMethod).toBe("credit_card");
    expect(typeof result.mpPaymentId).toBe("string");
    expect(result.mpPaymentId).toBe("123456");
  });

  it("lança erro quando valor menor que R$ 0,50", async () => {
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      token: "t", transactionAmount: 0.3, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError quando MP rejeita o cartão", async () => {
    mockMpCard.mockRejectedValue(new Error("invalid_card_token"));
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      token: "bad", transactionAmount: 50, description: "Corte",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("[IMP-1] lança 403 quando EMPLOYEE tenta criar pagamento para outra barbearia", async () => {
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const err: AppError = await useCase.execute(
      {
        token: "t", transactionAmount: 50, description: "Corte",
        installments: 1, paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-2"
      },
      { role: "EMPLOYEE", barbershopId: "shop-1" }
    ).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it("[IMP-1] permite MASTER_ADMIN criar pagamento para qualquer barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const useCase = new CreateCardPaymentUseCase(repo as any, mpServiceMock);
    const result = await useCase.execute(
      {
        token: "t", transactionAmount: 50, description: "Corte",
        installments: 1, paymentMethodId: "visa",
        payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
        barbershopId: "shop-99"
      },
      { role: "MASTER_ADMIN" }
    );
    expect(result.status).toBe("approved");
  });
});

describe("CreatePixPaymentUseCase", () => {
  it("cria pagamento PIX com QR code", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const result = await useCase.execute({
      transactionAmount: 40, description: "Barba",
      payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    expect(result.paymentMethod).toBe("pix");
    expect(result.pixQrCode?.qrCode).toBe("00020101...");
    expect(result.mpPaymentId).toBe("789012");
  });

  it("lança AppError quando MP não retorna QR code", async () => {
    mockMpPix.mockResolvedValue({
      ...makeMpPixResponse(),
      point_of_interaction: { transaction_data: {} }
    });
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    await expect(useCase.execute({
      transactionAmount: 40, description: "Barba",
      payer: { email: "a@b.com" }, barbershopId: "shop-1"
    })).rejects.toBeInstanceOf(AppError);
  });

  it("[IMP-1] lança 403 quando OWNER tenta criar PIX para outra barbearia", async () => {
    const useCase = new CreatePixPaymentUseCase(repo as any, mpServiceMock);
    const err: AppError = await useCase.execute(
      { transactionAmount: 40, description: "Barba", payer: { email: "a@b.com" }, barbershopId: "shop-2" },
      { role: "OWNER", barbershopId: "shop-1" }
    ).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });
});

describe("GetPaymentStatusUseCase", () => {
  it("retorna pagamento sem sync quando status é aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const fetched = await new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(fetched.id).toBe(created.id);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("sincroniza com MP quando status é pending", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockResolvedValue({ ...makeMpPixResponse(), status: "approved", status_detail: "accredited" });
    const updated = await new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(mockMpGet).toHaveBeenCalledOnce();
    // FIX-4: verifica que getPaymentById recebeu string, não Number
    expect(mockMpGet).toHaveBeenCalledWith("789012");
    expect(updated.status).toBe("approved");
  });

  it("[IMP-4] retorna cache e loga warning quando MP falha no sync", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockRejectedValue(new Error("MP timeout"));
    const warnSpy = vi.fn();
    const fetched = await new GetPaymentStatusUseCase(repo as any, mpServiceMock)
      .execute(created.id, false, { warn: warnSpy });
    expect(fetched.status).toBe("pending");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("Falha ao sincronizar");
  });

  it("lança AppError para id inexistente", async () => {
    await expect(
      new GetPaymentStatusUseCase(repo as any, mpServiceMock).execute("not-found")
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("ListPaymentsUseCase", () => {
  it("lista pagamentos por barbearia", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    const result = await new ListPaymentsUseCase(repo as any).execute("shop-1");
    expect(result.data.length).toBe(1);
    expect(result.total).toBe(1);
  });

  it("[FIX-3] MASTER_ADMIN sem barbershopId lista todos os pagamentos", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse({ id: 1 }));
    mockMpPix.mockResolvedValue(makeMpPixResponse({ id: 2 }));
    await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-2"
    });
    // undefined = sem filtro de barbearia (acesso de admin)
    const result = await new ListPaymentsUseCase(repo as any).execute(undefined);
    expect(result.data.length).toBe(2);
    expect(result.total).toBe(2);
  });
});

describe("CancelPaymentUseCase", () => {
  it("cancela pagamento pendente", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpCancel.mockResolvedValue({ ...makeMpPixResponse(), status: "cancelled", status_detail: "by_collector" });
    const cancelled = await new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(cancelled.status).toBe("cancelled");
    // FIX-4: cancelPayment recebeu string
    expect(mockMpCancel).toHaveBeenCalledWith("789012");
  });

  it("[FIX-1] retorna idempotentemente quando pagamento já está cancelado", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    const created = await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    // Simula webhook chegando antes: atualiza status para cancelled
    await repo.updateStatus(created.id, { status: "cancelled", statusDetail: "by_collector" });

    // Chamada de cancel não deve ir ao MP nem lançar erro
    const result = await new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id);
    expect(result.status).toBe("cancelled");
    expect(mockMpCancel).not.toHaveBeenCalled();
  });

  it("lança AppError ao tentar cancelar pagamento já aprovado", async () => {
    mockMpCard.mockResolvedValue(makeMpCardResponse());
    const created = await new CreateCardPaymentUseCase(repo as any, mpServiceMock).execute({
      token: "t", transactionAmount: 50, description: "x",
      installments: 1, paymentMethodId: "visa",
      payer: { email: "a@b.com", identification: { type: "CPF", number: "12345678901" } },
      barbershopId: "shop-1"
    });
    await expect(
      new CancelPaymentUseCase(repo as any, mpServiceMock).execute(created.id)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lança AppError para id inexistente", async () => {
    await expect(
      new CancelPaymentUseCase(repo as any, mpServiceMock).execute("not-found")
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("ProcessWebhookUseCase", () => {
  it("ignora payload que não é do tipo payment", async () => {
    await new ProcessWebhookUseCase(repo as any, mpServiceMock)
      .execute({ type: "subscription", data: { id: "1" } } as any);
    expect(mockMpGet).not.toHaveBeenCalled();
  });

  it("atualiza status ao receber webhook válido", async () => {
    mockMpPix.mockResolvedValue(makeMpPixResponse());
    await new CreatePixPaymentUseCase(repo as any, mpServiceMock).execute({
      transactionAmount: 40, description: "x", payer: { email: "a@b.com" }, barbershopId: "shop-1"
    });
    mockMpGet.mockResolvedValue({ ...makeMpPixResponse(), status: "approved", status_detail: "accredited" });
    await new ProcessWebhookUseCase(repo as any, mpServiceMock)
      .execute({ type: "payment", data: { id: "789012" } } as any);
    const payment = await repo.findByMpPaymentId("789012");
    expect(payment?.status).toBe("approved");
  });
});

// ── FIX-2: Validação de transactionAmount ───────────────────────────────────
describe("[FIX-2] paymentSchemas — transactionAmount", () => {
  // Importamos aqui para não poluir o topo do arquivo
  const { createCardPaymentSchema, createPixPaymentSchema } = await import(
    "@/modules/payments/schemas/paymentSchemas"
  );

  const baseCard = {
    token: "t", description: "x", installments: 1, paymentMethodId: "visa",
    payer: { email: "a@b.com", identification: { type: "CPF" as const, number: "12345678901" } },
    barbershopId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  };

  const basePix = {
    description: "x",
    payer: { email: "a@b.com" },
    barbershopId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
  };

  it("aceita R$ 49,99 no schema de cartão", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 49.99 })).not.toThrow();
  });

  it("aceita R$ 49,99 no schema de PIX", () => {
    expect(() => createPixPaymentSchema.parse({ ...basePix, transactionAmount: 49.99 })).not.toThrow();
  });

  it("aceita valores inteiros", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 100 })).not.toThrow();
  });

  it("rejeita valores negativos", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: -10 })).toThrow();
  });

  it("rejeita mais de 2 casas decimais", () => {
    expect(() => createCardPaymentSchema.parse({ ...baseCard, transactionAmount: 49.999 })).toThrow();
  });
});
EOF
log_ok "payments.spec.ts atualizado com todos os testes dos 4 fixes"

# =============================================================================
# Resumo final
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              ✔ Round 2 concluído — 4 fixes aplicados!       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  Arquivos modificados:"
echo "    src/modules/payments/schemas/paymentSchemas.ts"
echo "    src/modules/payments/repositories/IPaymentRepository.ts"
echo "    src/modules/payments/infra/repositories/PaymentRepository.ts"
echo "    src/modules/payments/infra/repositories/mocks/MockPaymentRepository.ts"
echo "    src/modules/payments/services/MercadoPagoService.ts"
echo "    src/modules/payments/useCases/cancelPayment/CancelPaymentUseCase.ts"
echo "    src/modules/payments/useCases/getPaymentStatus/GetPaymentStatusUseCase.ts"
echo "    src/modules/payments/useCases/listPayments/ListPaymentsUseCase.ts"
echo "    src/modules/payments/useCases/listPayments/ListPaymentsController.ts"
echo "    src/modules/payments/useCases/payments.spec.ts"
echo ""
echo "  Execute agora:"
echo "    npm test   →  todos os testes devem passar"
echo ""
