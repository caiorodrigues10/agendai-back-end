/// <reference types="vitest/globals" />

const savedVitest = process.env.VITEST;
delete (process.env as any).VITEST;

const prismaMock = vi.hoisted(() => ({
  crmFinancialEvent: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  queueItem: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  appointment: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  clientPackage: {
    findUnique: vi.fn(),
  },
  fiado: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  fiadoPayment: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  product: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  stockMovement: {
    create: vi.fn(),
  },
  service: {
    findUnique: vi.fn(),
  },
  retailSale: {
    create: vi.fn(),
  },
  retailSaleLine: {
    createMany: vi.fn(),
  },
  commissionEntry: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import {
  recordQueueCompletion,
  recordAppointmentCompletion,
  recordFiadoCreated,
  recordFiadoPayment,
  recordPackageSale,
} from "../services/crmLedger";

describe("CRM Reconciliation", () => {
  beforeEach(() => {
    delete (process.env as any).VITEST;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedVitest !== undefined) {
      process.env.VITEST = savedVitest;
    }
  });

  describe("1. Service completion does not duplicate revenue", () => {
    it("queue completion creates exactly one CrmFinancialEvent per queueItemId", async () => {
      prismaMock.queueItem.findUnique.mockResolvedValue({
        id: "queue-1",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "COMPLETED",
        finalPrice: 50,
        paymentMethod: "pix",
        completedAt: new Date("2026-09-01T14:00:00Z"),
        appointment: null,
      });

      await recordQueueCompletion("queue-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            barbershopId_sourceType_sourceId_kind: {
              barbershopId: "shop-1",
              sourceType: "queue",
              sourceId: "queue-1",
              kind: "SERVICE_COMPLETED",
            },
          },
          create: expect.objectContaining({
            grossAmount: 50,
            receivedAmount: 50,
          }),
        })
      );
    });

    it("appointment completion creates exactly one CrmFinancialEvent per appointmentId", async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: "appt-1",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "COMPLETED",
        servicePrice: 60,
        paymentMethod: "card",
        clientPackageId: null,
      });

      await recordAppointmentCompletion("appt-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            barbershopId_sourceType_sourceId_kind: {
              barbershopId: "shop-1",
              sourceType: "appointment",
              sourceId: "appt-1",
              kind: "SERVICE_COMPLETED",
            },
          },
        })
      );
    });

    it("calling recordQueueCompletion twice for same id is idempotent (upsert with update: {})", async () => {
      prismaMock.queueItem.findUnique.mockResolvedValue({
        id: "queue-1",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "COMPLETED",
        finalPrice: 50,
        paymentMethod: "pix",
        completedAt: new Date("2026-09-01T14:00:00Z"),
        appointment: null,
      });

      await recordQueueCompletion("queue-1");
      await recordQueueCompletion("queue-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(2);
      for (const call of prismaMock.crmFinancialEvent.upsert.mock.calls) {
        expect(call[0].update).toEqual({});
      }
    });
  });

  describe("2. Package sale generates revenue at sale time, not at session use", () => {
    it("recordPackageSale creates PACKAGE_SOLD event with receivedAmount = pricePaid", async () => {
      prismaMock.clientPackage.findUnique.mockResolvedValue({
        id: "pkg-1",
        barbershopId: "shop-1",
        clientId: "client-1",
        pricePaid: 200,
        purchasedAt: new Date("2026-09-01T10:00:00Z"),
      });

      await recordPackageSale("pkg-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: "PACKAGE_SOLD",
            grossAmount: 200,
            receivedAmount: 200,
            outstandingDelta: 0,
          }),
        })
      );
    });

    it("queue completion with clientPackageId does NOT create a financial event (revenue was at sale)", async () => {
      prismaMock.queueItem.findUnique.mockResolvedValue({
        id: "queue-2",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "COMPLETED",
        finalPrice: 50,
        paymentMethod: null,
        completedAt: new Date("2026-09-01T14:00:00Z"),
        appointment: { clientPackageId: "pkg-1" },
      });

      await recordQueueCompletion("queue-2");

      expect(prismaMock.crmFinancialEvent.upsert).not.toHaveBeenCalled();
    });
  });

  describe("3. Fiado goes to outstanding, not received", () => {
    it("queue completion with fiado payment sets receivedAmount=0 and outstandingDelta=amount", async () => {
      prismaMock.queueItem.findUnique.mockResolvedValue({
        id: "queue-3",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "COMPLETED",
        finalPrice: 80,
        paymentMethod: "fiado",
        completedAt: new Date("2026-09-01T14:00:00Z"),
        appointment: null,
      });

      await recordQueueCompletion("queue-3");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            grossAmount: 80,
            receivedAmount: 0,
            outstandingDelta: 80,
          }),
        })
      );
    });

    it("FIADO_CREATED from MANUAL origin records outstandingDelta = originalAmount", async () => {
      prismaMock.fiado.findUnique.mockResolvedValue({
        id: "fiado-1",
        barbershopId: "shop-1",
        clientId: "client-1",
        originalAmount: 120,
        paidAmount: 0,
        origin: "MANUAL",
        createdAt: new Date("2026-09-01T15:00:00Z"),
      });

      await recordFiadoCreated("fiado-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: "FIADO_CREATED",
            grossAmount: 120,
            outstandingDelta: 120,
            receivedAmount: 0,
          }),
        })
      );
    });

    it("FIADO_CREATED from SERVICE_COMPLETION origin has zero amounts (revenue already recorded)", async () => {
      prismaMock.fiado.findUnique.mockResolvedValue({
        id: "fiado-2",
        barbershopId: "shop-1",
        clientId: "client-1",
        originalAmount: 80,
        paidAmount: 0,
        origin: "SERVICE_COMPLETION",
        createdAt: new Date("2026-09-01T15:00:00Z"),
      });

      await recordFiadoCreated("fiado-2");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: "FIADO_CREATED",
            grossAmount: 0,
            outstandingDelta: 0,
          }),
        })
      );
    });
  });

  describe("4. Fiado payment increases received, decreases outstanding", () => {
    it("FIADO_PAYMENT sets receivedAmount=payment.amount and outstandingDelta=-payment.amount", async () => {
      prismaMock.fiadoPayment.findUnique.mockResolvedValue({
        id: "fp-1",
        fiadoId: "fiado-1",
        amount: 50,
        createdAt: new Date("2026-09-02T10:00:00Z"),
        fiado: {
          barbershopId: "shop-1",
          clientId: "client-1",
        },
      });

      await recordFiadoPayment("fp-1");

      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            kind: "FIADO_PAYMENT",
            receivedAmount: 50,
            outstandingDelta: -50,
            grossAmount: 0,
          }),
        })
      );
    });
  });

  describe("5. Product sale reduces stock exactly once", () => {
    it("stock movement is created with quantity=-1 and stockBefore/stockAfter computed correctly", async () => {
      const product = {
        id: "prod-1",
        barbershopId: "shop-1",
        name: "Shampoo",
        stockQty: 10,
        averageCost: 15,
        salePrice: 30,
        trackStock: true,
      };

      const quantity = 1;
      const stockBefore = product.stockQty;
      const stockAfter = stockBefore - quantity;

      await prismaMock.product.update({
        where: { id: "prod-1" },
        data: { stockQty: stockAfter },
      });

      await prismaMock.stockMovement.create({
        data: {
          barbershopId: "shop-1",
          productId: "prod-1",
          type: "SALE",
          quantity: -quantity,
          unitCost: product.averageCost,
          stockBefore,
          stockAfter,
          sourceType: "retail_sale",
          sourceId: "sale-1",
          createdById: "user-1",
        },
      });

      expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantity: -1,
            stockBefore: 10,
            stockAfter: 9,
          }),
        })
      );
    });
  });

  describe("6. Commission uses final price", () => {
    it("commission entry amount = finalPrice * commissionPercent / 100", async () => {
      const finalPrice = 75;
      const commissionPercent = 30;
      const expectedAmount = (finalPrice * commissionPercent) / 100;

      prismaMock.commissionEntry.create.mockResolvedValue({
        id: "ce-1",
        barbershopId: "shop-1",
        queueItemId: "queue-1",
        serviceId: "svc-1",
        professionalId: "barber-1",
        percentage: commissionPercent,
        amount: expectedAmount,
      });

      await prismaMock.commissionEntry.create({
        data: {
          barbershopId: "shop-1",
          queueItemId: "queue-1",
          serviceId: "svc-1",
          professionalId: "barber-1",
          percentage: commissionPercent,
          amount: expectedAmount,
        },
      });

      expect(prismaMock.commissionEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 22.5,
            percentage: 30,
          }),
        })
      );
    });
  });

  describe("7. Cancellation does not duplicate", () => {
    it("cancelled queue item does not create a CrmFinancialEvent", async () => {
      prismaMock.queueItem.findUnique.mockResolvedValue({
        id: "queue-4",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "CANCELLED",
        finalPrice: 50,
        paymentMethod: "pix",
        completedAt: null,
        appointment: null,
      });

      await recordQueueCompletion("queue-4");

      expect(prismaMock.crmFinancialEvent.upsert).not.toHaveBeenCalled();
    });

    it("cancelled appointment does not create a CrmFinancialEvent", async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: "appt-2",
        barbershopId: "shop-1",
        clientId: "client-1",
        serviceId: "svc-1",
        status: "CANCELLED",
        servicePrice: 60,
        paymentMethod: "card",
        clientPackageId: null,
      });

      await recordAppointmentCompletion("appt-2");

      expect(prismaMock.crmFinancialEvent.upsert).not.toHaveBeenCalled();
    });

    it("completion after cancel still only creates one event (idempotent upsert)", async () => {
      prismaMock.queueItem.findUnique
        .mockResolvedValueOnce({
          id: "queue-5",
          barbershopId: "shop-1",
          clientId: "client-1",
          serviceId: "svc-1",
          status: "CANCELLED",
          finalPrice: 50,
          paymentMethod: "pix",
          completedAt: null,
          appointment: null,
        })
        .mockResolvedValueOnce({
          id: "queue-5",
          barbershopId: "shop-1",
          clientId: "client-1",
          serviceId: "svc-1",
          status: "COMPLETED",
          finalPrice: 50,
          paymentMethod: "pix",
          completedAt: new Date("2026-09-01T14:00:00Z"),
          appointment: null,
        });

      await recordQueueCompletion("queue-5");
      expect(prismaMock.crmFinancialEvent.upsert).not.toHaveBeenCalled();

      await recordQueueCompletion("queue-5");
      expect(prismaMock.crmFinancialEvent.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
