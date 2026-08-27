import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import type { SubmitContactInput } from "../schemas/contactSchema";

const TOPIC_LABEL: Record<SubmitContactInput["topic"], string> = {
  planos: "Planos e preços",
  suporte: "Suporte técnico",
  parceria: "Parceria / franquia",
  outro: "Outro",
};

@injectable()
export class SubmitContactMessageUseCase {
  async execute(input: SubmitContactInput) {
    const topicLabel = TOPIC_LABEL[input.topic];
    const title = `Contato · ${topicLabel} · ${input.name}`;
    const message = [
      `De: ${input.name} <${input.email}>`,
      input.phone ? `Telefone: ${input.phone}` : null,
      `Assunto: ${topicLabel}`,
      "",
      input.message,
    ]
      .filter(Boolean)
      .join("\n");

    const notification = await prisma.adminNotification.create({
      data: {
        type: "CONTACT_MESSAGE",
        title: title.slice(0, 200),
        message,
        metadata: JSON.stringify({
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          topic: input.topic,
        }),
      },
    });

    const alertPhone =
      process.env.CONTACT_WHATSAPP?.trim() ||
      process.env.PLATFORM_WHATSAPP?.trim();

    if (alertPhone) {
      try {
        await enqueueWhatsApp({
          phone: alertPhone,
          message:
            `*Novo contato — AgendAI*\n\n` +
            `*${topicLabel}*\n` +
            `${input.name} · ${input.email}` +
            (input.phone ? `\nTel: ${input.phone}` : "") +
            `\n\n${input.message.slice(0, 500)}`,
          platform: true,
          deduplicationKey: `contact:${notification.id}`,
        });
      } catch {
        /* alerta WhatsApp não bloqueia o contato */
      }
    }

    return {
      id: notification.id,
      receivedAt: notification.createdAt.toISOString(),
    };
  }
}
