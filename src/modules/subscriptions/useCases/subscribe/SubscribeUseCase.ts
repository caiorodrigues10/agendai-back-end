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
        if (!data.cardToken || !data.cardPaymentMethodId) {
          throw new AppError("Token e método de pagamento do cartão são obrigatórios", 400);
        }
        if (!data.payerIdentification) {
          throw new AppError("Identificação (CPF/CNPJ) é obrigatória para cartão", 400);
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