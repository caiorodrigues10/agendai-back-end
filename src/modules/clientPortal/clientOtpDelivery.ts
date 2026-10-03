import { prisma } from "@/libs/prismaClient";
import { BRAND_NAME } from "@/config/brand";
import { AppError } from "@/shared/errors/AppError";
import { sendWhatsAppMessageDetailed } from "@/shared/services/evolutionApiService";

/** OTP is never returned to the browser or recorded in application logs. */
export async function deliverClientOtp(phone: string, code: string, salonId?: string): Promise<void> {
  let instanceName: string | undefined;
  if (salonId) {
    const salon = await prisma.barbershop.findFirst({ where: { id: salonId, active: true }, select: { evolutionInstanceName: true } });
    if (!salon) throw new AppError("Salão não encontrado", 404);
    instanceName = salon.evolutionInstanceName?.trim() || undefined;
    if (!instanceName) throw new AppError("O WhatsApp deste salão ainda não está conectado. Tente novamente mais tarde.", 503);
  }
  const result = await sendWhatsAppMessageDetailed(phone, `Seu código de acesso ao ${BRAND_NAME} é ${code}. Válido por 5 minutos. Não compartilhe este código.`, salonId ? { instanceName } : { platform: true });
  if (!result.ok) throw new AppError("Não foi possível enviar seu código pelo WhatsApp. Tente novamente mais tarde.", 503);
}
