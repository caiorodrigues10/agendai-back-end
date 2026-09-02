import { describe, expect, it } from "vitest";
import { listAppointmentsQuerySchema, updateAppointmentSchema } from "./appointmentSchemas";

describe("AppointmentStatus NO_SHOW", () => {
  it("aceita ausência na atualização e nos filtros", () => {
    expect(updateAppointmentSchema.parse({ status: "NO_SHOW" }).status).toBe("NO_SHOW");
    expect(listAppointmentsQuerySchema.parse({ status: "NO_SHOW" }).status).toBe("NO_SHOW");
  });
});
