import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";

function generateProtocol(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `AG-${ts}-${rand}`;
}

export class CreateTicketUseCase {
  async execute(data: {
    title: string;
    description: string;
    barbershopId?: string | null;
    channel?: string;
    category?: string;
    priority?: string;
    createdById: string;
  }) {
    const protocol = generateProtocol();

    const ticket = await prisma.ticket.create({
      data: {
        protocol,
        title: data.title,
        description: data.description,
        barbershopId: data.barbershopId ?? null,
        channel: (data.channel as any) ?? "OTHER",
        category: (data.category as any) ?? "QUESTION",
        priority: (data.priority as any) ?? "NORMAL",
        status: "OPEN",
        createdById: data.createdById,
      },
      select: {
        id: true,
        protocol: true,
        title: true,
        description: true,
        channel: true,
        category: true,
        priority: true,
        status: true,
        barbershopId: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: data.createdById,
        action: "CREATE_TICKET",
        resource: "Ticket",
        resourceId: ticket.id,
        details: JSON.stringify({ protocol, title: data.title }),
      },
    });

    return ticket;
  }
}
