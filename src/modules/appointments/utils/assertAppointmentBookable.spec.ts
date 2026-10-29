/// <reference types="vitest/globals" />
import { assertAppointmentBookable } from "./assertAppointmentBookable";
import { getShopOpenState } from "@/modules/barbershops/utils/getShopOpenState";

vi.mock("@/shared/utils/assertPublicShopOperationalAccess", () => ({
  assertPublicShopOperationalAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/barbershops/utils/getShopOpenState", () => ({
  getShopOpenState: vi.fn(),
}));

describe("assertAppointmentBookable — calendário", () => {
  it("bloqueia booking em data fechada por exceção", async () => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: false,
      reason: "SCHEDULE",
      queueClosed: false,
    });
    await expect(
      assertAppointmentBookable({
        barbershopId: "shop-1",
        serviceId: "svc-1",
        customerName: "Ana",
        whatsapp: "11999999999",
        date: "2026-09-07",
        time: "10:00",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Estabelecimento fechado neste dia",
    });
  });
});

describe("assertAppointmentBookable — serviço interno", () => {
  const baseBooking = {
    barbershopId: "shop-1",
    serviceId: "svc-1",
    customerName: "Ana",
    whatsapp: "11999999999",
    date: "2026-09-07",
    time: "10:00",
  };

  const makeDb = (publicBookable: boolean) =>
    ({
      service: {
        findFirst: vi.fn().mockResolvedValue({
          id: "svc-1",
          avgTimeMinutes: 30,
          publicBookable,
        }),
      },
      user: { count: vi.fn().mockResolvedValue(1) },
      schedule: { findUnique: vi.fn().mockResolvedValue(null) },
      appointment: { findMany: vi.fn().mockResolvedValue([]) },
    }) as any;

  beforeEach(() => {
    vi.mocked(getShopOpenState).mockResolvedValue({
      open: true,
      reason: "SCHEDULE",
      queueClosed: false,
    });
  });

  it("recusa agendamento público de serviço não público", async () => {
    await expect(
      assertAppointmentBookable(
        { ...baseBooking, source: "PUBLIC" },
        makeDb(false)
      )
    ).rejects.toMatchObject({ code: "SERVICE_NOT_PUBLICLY_BOOKABLE" });
  });

  it("permite o staff agendar serviço interno", async () => {
    await expect(
      assertAppointmentBookable(baseBooking, makeDb(false))
    ).resolves.toMatchObject({ durationMinutes: 30 });
  });

  it("permite agendamento público de serviço público", async () => {
    await expect(
      assertAppointmentBookable(
        { ...baseBooking, source: "PUBLIC" },
        makeDb(true)
      )
    ).resolves.toMatchObject({ durationMinutes: 30 });
  });
});
