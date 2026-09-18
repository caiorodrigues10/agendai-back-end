/// <reference types="vitest/globals" />
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {},
}));

vi.mock("tsyringe", () => ({
  container: { resolve: vi.fn() },
}));

const executeSlots = vi.fn();
vi.mock("../useCases/appointmentUseCases", () => ({
  CreateAppointmentUseCase: class {},
  CreatePublicAppointmentUseCase: class {},
  GetAppointmentUseCase: class {},
  ListAppointmentsUseCase: class {},
  UpdateAppointmentUseCase: class {},
  CancelAppointmentUseCase: class {},
  GetAvailabilityUseCase: class {},
  GetAvailableSlotsUseCase: class {
    execute = (...args: unknown[]) => executeSlots(...args);
  },
}));

vi.mock("../useCases/publicManagement/PublicAppointmentManagementUseCase", () => ({
  PublicAppointmentManagementUseCase: class {},
}));

vi.mock("../services/publicAppointmentToken", () => ({
  createPublicAppointmentToken: vi.fn(),
}));

import { AppointmentController } from "./AppointmentController";

function fakeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

describe("AppointmentController.slots", () => {
  let controller: AppointmentController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AppointmentController();
  });

  it("maps ZodError to AppError 400 without calling the use case", async () => {
    await expect(
      controller.slots(
        { query: { barbershopId: "not-a-uuid", date: "nope" } } as unknown as FastifyRequest,
        fakeReply(),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Parâmetros inválidos: informe barbershopId, serviceId e date (YYYY-MM-DD)",
    });

    expect(executeSlots).not.toHaveBeenCalled();
  });
});
