/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  barbershopFindUnique: vi.fn(),
  enqueueWhatsApp: vi.fn(),
  enqueueEmail: vi.fn(),
  ownerContact: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: { barbershop: { findUnique: mocks.barbershopFindUnique } },
  Prisma: {},
}));

vi.mock("@/shared/infra/queue", () => ({
  enqueueWhatsApp: mocks.enqueueWhatsApp,
  enqueueEmail: mocks.enqueueEmail,
}));

vi.mock("@/modules/email/services/ownerContact", () => ({
  getOwnerContactForBarbershop: mocks.ownerContact,
}));

import {
  formatPhoneBR,
  notifyShopAboutReservation,
  sanitizeCustomerName,
  type ReservationNotifyInput,
} from "./reservationNotify";

const SHOP = "00000000-0000-0000-0000-000000000001";
const RESERVATION = "00000000-0000-0000-0000-000000000003";

const SHOP_ROW = {
  whatsapp: "11999999999",
  evolutionInstanceName: "minha-instancia",
};

const input = (over: Partial<ReservationNotifyInput> = {}): ReservationNotifyInput => ({
  barbershopId: SHOP,
  reservationId: RESERVATION,
  shopName: "Barbearia Central",
  shopTimezone: "America/Sao_Paulo",
  productName: "Shampoo hidratante",
  quantity: 2,
  unitPrice: 40,
  customerName: "Ana Souza",
  whatsapp: "11988887777",
  expiresAt: new Date("2026-10-03T18:00:00.000Z"),
  ...over,
});

describe("reservationNotify — aviso de reserva ao salão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.barbershopFindUnique.mockResolvedValue(SHOP_ROW);
    mocks.ownerContact.mockResolvedValue({ id: "owner-1", email: "dono@exemplo.com", name: "Caio Silva" });
    mocks.enqueueWhatsApp.mockResolvedValue(undefined);
    mocks.enqueueEmail.mockResolvedValue(undefined);
  });

  it("envia WhatsApp quando o salão tem WhatsApp e instância conectados", async () => {
    await notifyShopAboutReservation(input());

    expect(mocks.enqueueWhatsApp).toHaveBeenCalledTimes(1);
    const job = mocks.enqueueWhatsApp.mock.calls[0][0];
    expect(job).toMatchObject({
      phone: "11999999999",
      instanceName: "minha-instancia",
      deduplicationKey: `product-reservation:${RESERVATION}:whatsapp`,
      notificationType: "PRODUCT_RESERVED_SHOP_ALERT",
      barbershopId: SHOP,
      sourceType: "PRODUCT_RESERVATION",
      sourceId: RESERVATION,
    });
    expect(job.message).toContain("*Nova reserva de produto*");
    expect(job.message).toContain("*Barbearia Central*");
    expect(job.message).toContain("Produto: 2× Shampoo hidratante");
    expect(job.message).toContain("Cliente: Ana Souza");
    expect(job.message).toContain("Contato: (11) 98888-7777");
    expect(job.message).toMatch(/R\$\s*80,00/);
    expect(job.message).toContain("Retirada até:");
  });

  it("não envia WhatsApp sem instância conectada (mesmo com WhatsApp do salão)", async () => {
    mocks.barbershopFindUnique.mockResolvedValue({ ...SHOP_ROW, evolutionInstanceName: "  " });

    await notifyShopAboutReservation(input());

    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
    // O e-mail segue independente da instância de WhatsApp.
    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("não envia WhatsApp quando o salão não tem WhatsApp cadastrado", async () => {
    mocks.barbershopFindUnique.mockResolvedValue({ ...SHOP_ROW, whatsapp: null });

    await notifyShopAboutReservation(input());

    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("envia e-mail ao OWNER com os dados da reserva", async () => {
    await notifyShopAboutReservation(input());

    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "product_reservation_alert",
        email: "dono@exemplo.com",
        ownerName: "Caio Silva",
        barbershopName: "Barbearia Central",
        productName: "Shampoo hidratante",
        quantity: 2,
        customerName: "Ana Souza",
        customerWhatsapp: "11988887777",
        total: 80,
        deduplicationKey: `product-reservation:${RESERVATION}:email`,
        panelUrl: expect.stringContaining("/app/products"),
      }),
    );
  });

  it("não envia e-mail quando o salão não tem OWNER", async () => {
    mocks.ownerContact.mockResolvedValue(null);

    await notifyShopAboutReservation(input());

    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.enqueueWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("falha de um canal não afeta o outro", async () => {
    mocks.enqueueEmail.mockRejectedValue(new Error("redis fora do ar"));

    await expect(notifyShopAboutReservation(input())).resolves.toBeUndefined();

    expect(mocks.enqueueWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("falha na leitura/instância do WhatsApp não derruba o e-mail", async () => {
    mocks.barbershopFindUnique.mockRejectedValue(new Error("timeout"));

    await expect(notifyShopAboutReservation(input())).resolves.toBeUndefined();

    expect(mocks.enqueueWhatsApp).not.toHaveBeenCalled();
    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("neutraliza HTML, asteriscos e quebras de linha do nome do cliente", async () => {
    await notifyShopAboutReservation(
      input({ customerName: "Ana <script>alert(1)</script>\n*VIP*  Souza" }),
    );

    const message = mocks.enqueueWhatsApp.mock.calls[0][0].message as string;
    const name = message.split("Cliente: ")[1].split("\n")[0];
    expect(name).toBe("Ana alert(1) VIP Souza");
    expect(message).not.toContain("<script>");
    expect(name).not.toContain("*");
    expect(name).not.toContain("\n");
  });

  it("limita o nome do cliente a 60 caracteres", async () => {
    await notifyShopAboutReservation(input({ customerName: "x".repeat(120) }));

    const message = mocks.enqueueWhatsApp.mock.calls[0][0].message as string;
    const name = message.split("Cliente: ")[1].split("\n")[0];
    expect(name).toHaveLength(60);
  });
});

describe("reservationNotify — helpers", () => {
  it("formata WhatsApp brasileiro", () => {
    expect(formatPhoneBR("(11) 98888-7777")).toBe("(11) 98888-7777");
    expect(formatPhoneBR("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhoneBR("123")).toBe("123");
  });

  it("remove quebras de linha e asteriscos do nome", () => {
    expect(sanitizeCustomerName("  Ana\n*Lima*  ")).toBe("Ana Lima");
    expect(sanitizeCustomerName("A".repeat(80))).toHaveLength(60);
  });
});
