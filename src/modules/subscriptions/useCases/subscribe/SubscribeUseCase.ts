import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { MercadoPagoService } from "@/modules/payments/services/MercadoPagoService";
import { AbacatePayService } from "@/modules/payments/services/AbacatePayService";
import { AsaasService } from "@/modules/payments/services/AsaasService";
import { IPaymentRepository } from "@/modules/payments/repositories/IPaymentRepository";
import { AppError } from "@/shared/errors/AppError";
import { IPaymentResponseDTO } from "@/modules/payments/dtos/IPaymentDTO";
import { ISubscribeDTO, ISubscriptionResponseDTO } from "../../dtos/ISubscriptionDTO";
import { buildSubscriptionResponse } from "../../utils/subscriptionMapper";
import { TRIAL_DAYS, billingPeriodDays } from "@/shared/constants/subscription";
import { Prisma } from "@prisma/client";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("subscriptions:subscribe");

function frontendBaseUrl(): string {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, "");
  const firstOrigin = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)[0];
  return (firstOrigin || "http://localhost:3003").replace(/\/$/, "");
}

@injectable()
export class SubscribeUseCase {
  constructor(
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService,
    @inject("AbacatePayService")
    private abacateService: AbacatePayService,
    @inject("AsaasService")
    private asaasService: AsaasService,
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
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: data.barbershopId },
      select: { id: true, name: true, active: true, createdAt: true },
    });

    if (!barbershop || !barbershop.active) {
      throw new AppError("Salão não encontrado ou inativo", 404);
    }

    const plan = await prisma.plan.findUnique({
      where: { id: data.planId },
      select: {
        id: true,
        name: true,
        price: true,
        active: true,
        description: true,
        abacateProductId: true,
        billingCycle: true,
      },
    });

    if (!plan || !plan.active) {
      throw new AppError("Plano não encontrado ou inativo", 404);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const lockedBarbershop = await tx.barbershop.findUnique({
          where: { id: data.barbershopId },
          select: { id: true, active: true },
        });

        if (!lockedBarbershop || !lockedBarbershop.active) {
          throw new AppError("Salão não encontrado ou inativo", 404);
        }

        const existing = await tx.subscription.findUnique({
          where: { barbershopId: data.barbershopId },
        });

        // Trial ou plano já pago: o dono pode gerar PIX/cartão para ativar ou
        // trocar o ciclo. Não rebaixar para PAST_DUE no meio do checkout —
        // senão o painel trava antes do pagamento. O webhook promove a ACTIVE.
        const keepAccessUntilPaid =
          existing?.status === "TRIALING" || existing?.status === "ACTIVE";

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        const pendingUntilWebhook =
          data.paymentMethod === "pix" ||
          data.paymentMethod === "payment_link" ||
          data.paymentMethod === "asaas";
        const initialStatus = keepAccessUntilPaid
          ? existing!.status
          : pendingUntilWebhook
            ? "PAST_DUE"
            : "ACTIVE";

        const subscription = await tx.subscription.upsert({
          where: { barbershopId: data.barbershopId },
          update: {
            planId: plan.id,
            status: initialStatus,
            startDate: keepAccessUntilPaid ? existing!.startDate : new Date(),
            endDate: keepAccessUntilPaid
              ? existing!.endDate
              : pendingUntilWebhook
                ? null
                : dueDate,
            cancelDate: null,
          },
          create: {
            barbershopId: data.barbershopId,
            planId: plan.id,
            status: initialStatus,
            startDate: new Date(),
            endDate: pendingUntilWebhook ? null : dueDate,
          },
        });

        await tx.invoice.deleteMany({
          where: { subscriptionId: subscription.id, status: "PENDING" },
        });

        const invoice = await tx.invoice.create({
          data: {
            subscriptionId: subscription.id,
            amount: plan.price,
            dueDate,
            status: "PENDING",
            paymentMethod:
              data.paymentMethod === "asaas"
                ? data.asaasBillingType === "CREDIT_CARD"
                  ? "credit_card"
                  : "pix"
                : data.paymentMethod,
          },
        });

        return { subscription, invoice };
      },
      {
        maxWait: 5000,
        timeout: 10000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    const { subscription, invoice } = result;
    const externalReference = `ag-sub-${subscription.id}-inv-${invoice.id}`;
    const description = `Assinatura AgendAI — ${plan.name}`;

    let paymentRecord: IPaymentResponseDTO | undefined;

    try {
      if (data.paymentMethod === "payment_link") {
        paymentRecord = await this.createAbacatePaymentLink({
          plan,
          data,
          barbershopId: data.barbershopId,
          externalReference,
          description,
        });
      } else if (data.paymentMethod === "asaas") {
        paymentRecord = await this.createAsaasPayment({
          plan,
          data,
          barbershopId: data.barbershopId,
          externalReference,
          description,
        });
      } else if (data.paymentMethod === "pix") {
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
          expirationMinutes: 60 * 24,
        });

        paymentRecord = await this.paymentRepo.create({
          mpPaymentId: mpResponse.id,
          provider: "MERCADOPAGO",
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
            mpResponse.point_of_interaction?.transaction_data?.qr_code_base64 ??
            null,
          pixExpirationDate: mpResponse.date_of_expiration
            ? new Date(mpResponse.date_of_expiration)
            : null,
          rawResponse: JSON.stringify(mpResponse),
        });
      } else {
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

        paymentRecord = await this.paymentRepo.create({
          mpPaymentId: mpResponse.id,
          provider: "MERCADOPAGO",
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

        if (mpResponse.status === "approved") {
          await prisma.$transaction([
            prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: "PAID", paidAt: new Date(), paymentMethod },
            }),
            prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: "ACTIVE",
                endDate: new Date(
                  Date.now() + billingPeriodDays(plan.billingCycle) * 86400000
                ),
              },
            }),
          ]);
          const { qualifyReferralOnPayment } = await import(
            "@/modules/referrals/services/referralService"
          );
          await qualifyReferralOnPayment(data.barbershopId).catch((err) => {
            logger.warn({ err, barbershopId: data.barbershopId }, "Falha ao qualificar indicação após pagamento");
          });
        } else {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "PAST_DUE" },
          });
        }
      }
    } catch (error: any) {
      if (error instanceof AppError) throw error;

      await prisma.subscription
        .update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE" },
        })
        .catch((err) => {
          logger.error({ err, subscriptionId: subscription.id }, "Falha ao marcar subscription como PAST_DUE na recuperação de erro");
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
        invoices: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return {
      ...buildSubscriptionResponse(full, barbershop.createdAt, TRIAL_DAYS),
      payment: paymentRecord,
    };
  }

  private async createAbacatePaymentLink(params: {
    plan: {
      id: string;
      name: string;
      price: number;
      description: string | null;
      abacateProductId: string | null;
    };
    data: ISubscribeDTO;
    barbershopId: string;
    externalReference: string;
    description: string;
  }): Promise<IPaymentResponseDTO> {
    const { plan, data, barbershopId, externalReference, description } = params;

    let productId = plan.abacateProductId;
    if (!productId) {
      const product = await this.abacateService.ensureProduct({
        externalId: plan.id,
        name: plan.name,
        priceReais: plan.price,
        description: plan.description,
      });
      productId = product.id;
      await prisma.plan.update({
        where: { id: plan.id },
        data: { abacateProductId: productId },
      });
    }

    let customerId: string | undefined;
    try {
      const name = [data.payerFirstName, data.payerLastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const customer = await this.abacateService.createCustomer({
        email: data.payerEmail,
        name: name || undefined,
        taxId: data.payerIdentification?.number,
      });
      customerId = customer.id;
    } catch {
      // Customer opcional — checkout funciona sem pré-cadastro
    }

    const base = frontendBaseUrl();
    const checkout = await this.abacateService.createCheckout({
      productId,
      externalId: externalReference,
      customerId,
      returnUrl: `${base}/checkout?planId=${plan.id}&status=back`,
      completionUrl: `${base}/checkout?planId=${plan.id}&status=success`,
      methods: ["PIX", "CARD"],
      metadata: {
        barbershopId,
        planId: plan.id,
        externalReference,
      },
    });

    if (!checkout.url) {
      throw new AppError("AbacatePay não retornou URL de checkout", 502);
    }

    return this.paymentRepo.create({
      mpPaymentId: null,
      provider: "ABACATEPAY",
      providerPaymentId: checkout.id,
      checkoutUrl: checkout.url,
      status: "pending",
      statusDetail: checkout.status ?? "PENDING",
      paymentMethod: "payment_link",
      transactionAmount: plan.price,
      currency: "BRL",
      description,
      barbershopId,
      externalReference,
      rawResponse: JSON.stringify(checkout),
    });
  }

  /**
   * Asaas (checkout embutido): billingType PIX retorna o QR Code direto;
   * CREDIT_CARD envia `creditCard` (número) ou `creditCardToken` legado
   * ao Asaas via backend — o endpoint público de tokenização no browser
   * não funciona (CORS/auth). Sem redirect — webhook ativa a assinatura.
   */
  private async createAsaasPayment(params: {
    plan: {
      id: string;
      name: string;
      price: number;
      description: string | null;
      abacateProductId: string | null;
    };
    data: ISubscribeDTO;
    barbershopId: string;
    externalReference: string;
    description: string;
  }): Promise<IPaymentResponseDTO> {
    const { plan, data, barbershopId, externalReference, description } = params;

    const name = [data.payerFirstName, data.payerLastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const customerId = await this.asaasService.ensureCustomer({
      name: name || undefined,
      email: data.payerEmail,
      cpfCnpj: data.payerIdentification?.number,
      externalReference: `ag-customer-${barbershopId}`,
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const isCard = data.asaasBillingType === "CREDIT_CARD";
    const card = data.asaasCreditCard;

    if (isCard) {
      if (!card && !data.cardToken) {
        throw new AppError(
          "Dados do cartão são obrigatórios para pagamento Asaas no cartão",
          400
        );
      }
      if (!data.payerIdentification) {
        throw new AppError(
          "Identificação (CPF/CNPJ) é obrigatória para pagamento no cartão",
          400
        );
      }
    }

    const expiryYear = card
      ? card.expiryYear.length === 2
        ? `20${card.expiryYear}`
        : card.expiryYear
      : undefined;

    const payment = await this.asaasService.createPayment({
      customer: customerId,
      billingType: isCard ? "CREDIT_CARD" : "PIX",
      value: plan.price,
      dueDate: dueDateStr,
      description,
      externalReference,
      creditCard: isCard
        ? card
          ? {
              holderName: card.holderName,
              number: card.number,
              expiryMonth: card.expiryMonth.padStart(2, "0"),
              expiryYear: expiryYear!,
              ccv: card.ccv,
            }
          : { creditCardToken: data.cardToken }
        : undefined,
      creditCardHolderInfo: isCard
        ? {
            name: name || card?.holderName || undefined,
            email: data.payerEmail,
            cpfCnpj: data.payerIdentification!.number,
            ...(card
              ? {
                  postalCode: card.postalCode,
                  addressNumber: card.addressNumber,
                  phone: card.phone,
                }
              : {}),
          }
        : undefined,
      remoteIp: isCard ? data.remoteIp : undefined,
    });

    let pixQrCode:
      | { qrCode: string; qrCodeBase64: string; expirationDate: string }
      | undefined;
    if (!isCard) {
      const qr = payment.pixQrCode ?? (await this.asaasService.getPixQrCode(payment.id).catch(() => null));
      if (qr?.payload && qr.encodedImage) {
        pixQrCode = {
          qrCode: qr.payload,
          qrCodeBase64: qr.encodedImage,
          expirationDate: qr.expirationDate || "",
        };
      }
    }

    return this.paymentRepo.create({
      mpPaymentId: null,
      provider: "ASAAS",
      providerPaymentId: payment.id,
      checkoutUrl: null,
      status: "pending",
      statusDetail: payment.status ?? "PENDING",
      paymentMethod: isCard ? "credit_card" : "pix",
      transactionAmount: plan.price,
      currency: "BRL",
      description,
      barbershopId,
      externalReference,
      pixQrCode: pixQrCode?.qrCode ?? null,
      pixQrCodeBase64: pixQrCode?.qrCodeBase64 ?? null,
      pixExpirationDate: pixQrCode?.expirationDate
        ? new Date(pixQrCode.expirationDate)
        : null,
      rawResponse: JSON.stringify(payment),
    });
  }
}
