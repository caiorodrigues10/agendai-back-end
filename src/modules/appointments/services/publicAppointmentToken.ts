import { sign, verify, type Secret } from "jsonwebtoken";
import auth from "@/config/auth";
import { AppError } from "@/shared/errors/AppError";

type PublicPurpose = "manage" | "session";

interface PublicAppointmentPayload {
  sub: string;
  barbershopId: string;
  version: number;
  purpose: PublicPurpose;
}

export function createPublicAppointmentToken(
  appointmentId: string,
  barbershopId: string,
  version: number,
  purpose: PublicPurpose = "manage",
  expiresIn: string = purpose === "manage" ? "14d" : "15m",
): string {
  return sign(
    { sub: appointmentId, barbershopId, version, purpose },
    auth.secret as Secret,
    { expiresIn: expiresIn as any, audience: "public-appointment" },
  );
}

export function readPublicAppointmentToken(token: string, purpose: PublicPurpose): PublicAppointmentPayload {
  try {
    const payload = verify(token, auth.secret as Secret, {
      audience: "public-appointment",
    }) as Partial<PublicAppointmentPayload>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.barbershopId !== "string" ||
      typeof payload.version !== "number" ||
      payload.purpose !== purpose
    ) throw new Error("invalid payload");
    return payload as PublicAppointmentPayload;
  } catch {
    throw new AppError("Link de agendamento inválido ou expirado", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
  }
}
