import { describe, expect, it, vi } from "vitest";
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
      reason: "EXCEPTION",
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
