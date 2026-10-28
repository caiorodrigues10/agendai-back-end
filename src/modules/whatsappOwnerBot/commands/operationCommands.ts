import { maskPhone } from "../messages";
import { ownerBotToday } from "./periods";
import { numberedList, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de operação: abrir/fechar a loja, pausar a fila, horário de hoje
 * e aviso em massa para os clientes do dia.
 */
export const operationCommands: OwnerBotCommand[] = [
  {
    id: "op.shop.status",
    category: "OPERACAO",
    risk: "READ",
    triggers: [
      /\b(loja|salao|salão|estabelecimento)\b.*\b(aberta|fechada|aberto|status)\b/,
      /\besta aberto\b/,
      /\b(status|como esta)\b.*\b(loja|salao)\b/,
    ],
    keywords: ["loja", "aberta", "status"],
    description: "Status da loja",
    examples: ["a loja está aberta?", "status do salão"],
    async run(ctx) {
      const status = await ctx.actions.shopStatus(ctx.actor.barbershopId);
      const open = status.openState?.open;
      const reason = status.openState?.reason;

      const lines = [
        open ? "A loja está aberta." : "A loja está fechada.",
        status.manualStatus && status.manualStatus !== "AUTO"
          ? `Modo manual: ${status.manualStatus}`
          : null,
        status.queueClosed ? "Fila pausada hoje." : null,
        reason && !open ? `Motivo: ${reason}` : null,
      ].filter(Boolean) as string[];

      return {
        text: lines.join("\n"),
        suggestions: ["abrir a loja", "fechar a loja", "fila agora"],
      };
    },
  },

  {
    id: "op.shop.open",
    category: "OPERACAO",
    risk: "WRITE",
    triggers: [
      /\b(abrir|abre|abrir a loja|abrir o salao)\b/,
    ],
    keywords: ["abrir", "loja"],
    description: "Abrir a loja hoje",
    examples: ["abrir a loja"],
    async run(ctx) {
      const summary = "Abrir a loja agora (modo manual)";
      if (!ctx.confirmed) {
        return {
          text: `${summary}?\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }
      await ctx.actions.setShopStatus(
        ctx.actor.barbershopId,
        { status: "OPEN" },
        ctx.actor
      );
      return {
        text: "Loja aberta. Bom trabalho! 💈",
        suggestions: ["status da loja", "agenda de hoje"],
      };
    },
  },

  {
    id: "op.shop.close",
    category: "OPERACAO",
    risk: "WRITE",
    triggers: [
      /\b(fechar|fecha|fechar a loja|fechar o salao)\b/,
    ],
    keywords: ["fechar", "loja"],
    description: "Fechar a loja hoje",
    examples: ["fechar a loja"],
    async run(ctx) {
      const summary = "Fechar a loja agora (modo manual)";
      if (!ctx.confirmed) {
        return {
          text: `${summary}?\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }
      await ctx.actions.setShopStatus(
        ctx.actor.barbershopId,
        { status: "CLOSED" },
        ctx.actor
      );
      return {
        text: "Loja fechada. Até amanhã! 👋",
        suggestions: ["fechar o caixa do dia", "resumo de hoje"],
      };
    },
  },

  {
    id: "op.queue.pause",
    category: "OPERACAO",
    risk: "WRITE",
    triggers: [
      /\b(pausar|parar|fechar)\b.*\b(fila|agendamentos online|agendamento online)\b/,
      /\b(nao|nao quero) (mais )?(receber|aceitar) (agendamentos|horarios)\b/,
    ],
    keywords: ["pausar", "fila", "agendamentos"],
    description: "Pausar fila / agendamentos online",
    examples: ["pausar a fila", "não quero mais receber agendamentos online"],
    async run(ctx) {
      const status = await ctx.actions.shopStatus(ctx.actor.barbershopId);
      const alreadyPaused = Boolean(status.queueClosed);
      const summary = alreadyPaused ? "Reabrir a fila e os agendamentos online" : "Pausar a fila e os agendamentos online";

      if (!ctx.confirmed) {
        return {
          text: `${summary}?\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.setShopStatus(
        ctx.actor.barbershopId,
        { queueClosed: !alreadyPaused },
        ctx.actor
      );
      return {
        text: alreadyPaused
          ? "Fila e agendamentos online reabertos."
          : "Fila e agendamentos online pausados.",
        suggestions: ["status da loja", "agenda de hoje"],
      };
    },
  },

  {
    id: "op.hours.today",
    category: "OPERACAO",
    risk: "WRITE",
    triggers: [
      /\b(hoje|amanha|amanã)\b.*\b(fecho|abre|horario|horário)\b/,
      /\b(mudar|alterar|ajustar)\b.*\b(horario de hoje|horario de amanha)\b/,
    ],
    keywords: ["horario", "fecho", "abre"],
    description: "Alterar o horário de hoje",
    examples: ["hoje fecho às 17h"],
    async run(ctx, entities) {
      const time = entities.time;
      if (!time) {
        return {
          text: "Que horas? (ex.: 17:00)",
          flow: { kind: "COMMAND", step: "TIME", commandId: "op.hours.today" },
          suggestions: [],
        };
      }

      const schedule = await ctx.actions.schedule(ctx.actor.barbershopId);
      const weekday = new Date(
        `${ownerBotToday(ctx.timezone, ctx.now)}T12:00:00Z`
      ).getUTCDay();
      const current = schedule.find((day) => day.dayOfWeek === weekday);

      const summary = `Mudar o horário de hoje para ${current?.openTime ?? ""}–${time}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      const updated = schedule.map((day) =>
        day.dayOfWeek === weekday ? { ...day, closeTime: time } : day
      );
      await ctx.actions.updateSchedule(ctx.actor.barbershopId, updated, ctx.actor);

      return {
        text: `Horário de hoje atualizado: fecha às ${time}.`,
        suggestions: ["status da loja", "agenda de hoje"],
      };
    },
  },

  {
    id: "op.notify.today",
    category: "OPERACAO",
    risk: "WRITE",
    triggers: [
      /\b(avisar|avisa|mandar mensagem|comunicar)\b.*\b(clientes de hoje|clientes do dia|todos de hoje)\b/,
      /\b(atrasaremos|atraso|demoraremos|demora)\b.*\b(clientes|hoje)\b/,
    ],
    keywords: ["avisar", "clientes", "hoje"],
    description: "Avisar os clientes de hoje",
    examples: ["avisa os clientes de hoje que atrasaremos 20 min"],
    async run(ctx) {
      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const pending = appointments.filter(
        (item) => item.status === "CONFIRMED" && item.whatsapp
      );

      if (!pending.length) {
        return {
          text: "Não há clientes confirmados com WhatsApp para avisar hoje.",
          suggestions: ["agenda de hoje"],
        };
      }

      const message =
        "Oi! Informamos que hoje todos os atendimentos podem atrasar cerca de 20 minutos. Pedimos desculpas pelo transtorno!";
      const summary = `Avisar ${pending.length} clientes de hoje: "${message}"`;

      if (!ctx.confirmed) {
        return {
          text:
            `${summary}\n\n⚠️ Serão ${pending.length} mensagens pelo WhatsApp do salão.\n` +
            "Para confirmar, digite CONFIRMAR.",
          confirmation: { summary, strong: true },
        };
      }

      const sent = await ctx.actions.sendCampaignToClients(
        ctx.actor.barbershopId,
        pending.map((item) => ({ phone: item.whatsapp, name: item.customerName })),
        message,
        { type: "TODAY_DELAY" }
      );

      return {
        text: `Aviso enviado para ${sent.sent} de ${pending.length} clientes.${
          sent.failed ? ` ${sent.failed} falharam.` : ""
        }`,
        suggestions: ["agenda de hoje", "clientes atrasados"],
      };
    },
  },
];

export { suggestionsLine, numberedList, maskPhone };
