import { ownerBotToday } from "./periods";
import { formatBRL } from "./money";
import { maskPhone } from "../messages";
import { findByName, numberedList, periodOrDefault, shortDate, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de agenda, fila e lista de espera.
 *
 * As ações de appointment (agendar, cancelar, remarcar, check-in, encerrar,
 * falta) continuam nos fluxos multi-passo do serviço — aqui elas só entram no
 * registry para o menu, a ajuda e o casamento de intenções.
 */
export const agendaCommands: OwnerBotCommand[] = [
  {
    id: "agenda.today",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(agenda|horarios|atendimentos|servicos|consultas|banhos|ordens|aulas|lavagens|sessoes)\b.*\b(hoje|de hoje|de hj)\b/,
      /\b(hoje|de hoje|de hj)\b.*\b(agenda|horarios|atendimentos|clientes|pacientes|tutores|alunos)\b/,
      /\bver (a )?agenda\b/,
      /\bminha agenda\b/,
      /^agenda$/,
    ],
    keywords: ["agenda", "horarios", "hoje"],
    description: "Ver a agenda do dia",
    examples: ["agenda de hoje", "o que tenho hoje"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "day");
      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const active = appointments.filter((item) => item.status !== "CANCELLED");

      if (!active.length) {
        return {
          text: `Não há ${ctx.labels.appointment === "agenda" ? "horários" : ctx.labels.servicePlural} na agenda de hoje.\n\nQuer agendar? Envie "agendar".`,
          suggestions: ["agendar", "horários livres amanhã", "fila agora"],
        };
      }

      const lines = active.map((item, index) => {
        const status = statusLabel(item.status);
        return `${index + 1}. ${item.time} — ${item.customerName} (${item.serviceName ?? ctx.labels.service}) [${status}]`;
      });

      return {
        text: truncateAgenda(
          `${ctx.labels.appointment === "agenda" ? "Agenda de hoje" : "Agenda de hoje"}:\n${lines.join("\n")}`
        ),
        list: {
          kind: "APPOINTMENTS",
          items: active.map((item) => ({
            id: item.id,
            label: `${item.time} — ${item.customerName} (${item.serviceName ?? ctx.labels.service})`,
          })),
        },
        suggestions: ["próximo cliente", "horários livres hoje", "fila agora"],
      };
    },
  },

  {
    id: "agenda.week",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(agenda|horarios|atendimentos|clientes)\b.*\b(semana|proximos 7|7 dias)\b/,
      /\bsemana (que vem|proxima)\b/,
    ],
    keywords: ["agenda", "semana"],
    description: "Ver a agenda da semana",
    examples: ["agenda da semana", "agenda dos próximos 7 dias"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "week");
      const from = ownerBotToday(ctx.timezone, ctx.now);
      const toDate = new Date(period.to.getTime() + 24 * 3600 * 1000);
      const to = toDate.toISOString().slice(0, 10);
      const appointments = await ctx.actions.listAppointmentsRange(
        ctx.actor.barbershopId,
        from,
        to
      );
      const active = appointments.filter((item) => item.status !== "CANCELLED");

      if (!active.length) {
        return {
          text: "Não há horários marcados para esta semana.",
          suggestions: ["agenda de hoje", "agendar"],
        };
      }

      const byDate = new Map<string, typeof active>();
      for (const item of active) {
        const key = item.date.toISOString().slice(0, 10);
        const list = byDate.get(key) ?? [];
        list.push(item);
        byDate.set(key, list);
      }

      const blocks = [...byDate.entries()].map(([date, items]) => {
        const lines = items
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((item) => `• ${item.time} ${item.customerName} (${item.serviceName ?? ctx.labels.service})`);
        return `${shortDate(date)}:\n${lines.join("\n")}`;
      });

      return {
        text: truncateAgenda(`Agenda da semana:\n\n${blocks.join("\n\n")}`),
        suggestions: ["agenda de hoje", "próximo cliente", "clientes atrasados"],
      };
    },
  },

  {
    id: "agenda.next",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(proximo|proxima|que vem|seguinte)\b.*\b(cliente|paciente|aluno|tutor|atendimento)\b/,
      /\bquem (e|esta) o (proximo|proxima)\b/,
      /\bchamar (o|a|proximo|proxima)\b/,
    ],
    keywords: ["proximo", "cliente"],
    description: "Próximo cliente da fila",
    examples: ["próximo cliente", "quem é o próximo"],
    async run(ctx) {
      const waiting = await ctx.actions.listWaitingQueue(ctx.actor.barbershopId);
      const next = waiting[0];
      if (next) {
        return {
          text: `Próximo da ${ctx.labels.queue}: ${next.customerName} (${next.serviceName ?? ctx.labels.service}).\n\nEnvie "check-in" para chamar.`,
          suggestions: ["check-in", "fila agora"],
        };
      }

      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const nowTime = ctx.now.toISOString().slice(11, 16);
      const upcoming = appointments
        .filter((item) => item.status === "CONFIRMED" && item.time > nowTime)
        .sort((a, b) => a.time.localeCompare(b.time))[0];

      if (!upcoming) {
        return {
          text: `Não há ninguém na ${ctx.labels.queue} nem horário marcado para daqui para frente hoje.`,
          suggestions: ["agenda de hoje", "agendar"],
        };
      }

      return {
        text: `Próximo: ${upcoming.time} — ${upcoming.customerName} (${upcoming.serviceName ?? ctx.labels.service}).`,
        suggestions: ["check-in", "agenda de hoje"],
      };
    },
  },

  {
    id: "agenda.late",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(atrasad|nao chegou|nao apareceram|atraso)\b/,
      /\bclientes?\b.*\batrasad/,
    ],
    keywords: ["atrasados", "clientes", "atraso"],
    description: "Clientes atrasados de hoje",
    examples: ["clientes atrasados", "quem ainda não chegou"],
    async run(ctx) {
      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const nowTime = ctx.now.toISOString().slice(11, 16);
      const late = appointments.filter(
        (item) => item.status === "CONFIRMED" && item.time < nowTime
      );

      if (!late.length) {
        return {
          text: "Nenhum cliente atrasado até agora. 🎉",
          suggestions: ["próximo cliente", "agenda de hoje"],
        };
      }

      const lines = late.map(
        (item, index) =>
          `${index + 1}. ${item.time} — ${item.customerName} (${item.serviceName ?? ctx.labels.service})`
      );
      return {
        text: truncateAgenda(
          `${late.length} ${late.length === 1 ? "cliente atrasado" : "clientes atrasados"}:\n${lines.join("\n")}`
        ),
        suggestions: ["avisar cliente atrasado", "agenda de hoje"],
      };
    },
  },

  {
    id: "agenda.free",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(horarios|vagas|disponibilidade| livre|livres|vago|vaga)\b.*\b(hoje|amanha|amanhã|disponiveis|disponíveis|livres)\b/,
      /\bquando (posso|da pra|tenho)\b/,
      /\bhorarios livres\b/,
    ],
    keywords: ["horarios", "livres", "vagas"],
    description: "Horários livres",
    examples: ["horários livres amanhã", "tem vaga hoje?"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "day");
      const date = ownerBotToday(ctx.timezone, ctx.now);
      const slots = await ctx.actions.availability(ctx.actor.barbershopId, date);
      const free = slots.map((slot) => slot.time).slice(0, 12);

      if (!free.length) {
        return {
          text: `Não achei horários livres para ${period.label}.`,
          suggestions: ["agenda de hoje", "agendar"],
        };
      }

      return {
        text: `Horários livres (${period.label}):\n${free.join(", ")}`,
        suggestions: ["agendar", "agenda de hoje"],
      };
    },
  },

  {
    id: "agenda.staff",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(agenda|horarios|clientes)\b.*\b(da|do|da profissional|dele|dela)\b/,
      /\bcomo esta (a |o )?agenda\b/,
    ],
    keywords: ["agenda", "profissional"],
    description: "Agenda de um profissional",
    examples: ["agenda da Ana", "horários do João"],
    async run(ctx, entities) {
      const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
      const match = findByName(staff, entities.staffName ?? entities.subject, (item) => item.name);
      if (!match) {
        return {
          text: `Não encontrei esse profissional. Quem está na equipe?\n${numberedList(
            staff.map((item) => ({ label: item.name }))
          )}`,
          list: { kind: "STAFF", items: staff.map((item) => ({ id: item.id, label: item.name })) },
          suggestions: ["agenda de hoje"],
        };
      }

      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const mine = appointments.filter(
        (item) => item.staffId === match.item.id && item.status !== "CANCELLED"
      );

      if (!mine.length) {
        return {
          text: `${match.item.name} não tem horários marcados hoje.`,
          suggestions: ["agenda de hoje", "comissão do mês"],
        };
      }

      const lines = mine
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((item, index) =>
          `${index + 1}. ${item.time} — ${item.customerName} (${item.serviceName ?? ctx.labels.service})`
        );
      return {
        text: truncateAgenda(`Agenda de ${match.item.name} hoje:\n${lines.join("\n")}`),
        suggestions: [`comissão do ${match.item.name}`, "agenda de hoje"],
      };
    },
  },

  {
    id: "queue.status",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(fila|queue|espera|tempo de espera|status da fila)\b/,
      /\bcomo (esta|ta) a fila\b/,
    ],
    keywords: ["fila", "espera", "status"],
    description: "Status da fila e tempo de espera",
    examples: ["como está a fila", "tempo de espera"],
    async run(ctx) {
      const waiting = await ctx.actions.listWaitingQueue(ctx.actor.barbershopId);
      const metrics = await ctx.actions.queueMetrics(ctx.actor.barbershopId);
      const avgWait = metrics?.averageWaitMinutes ?? metrics?.avgWaitMinutes ?? null;

      const lines = waiting
        .slice(0, 8)
        .map(
          (item, index) =>
            `${index + 1}. ${item.customerName} (${item.serviceName ?? ctx.labels.service})`
        );

      const waitText =
        typeof avgWait === "number" ? `Espera média: ${Math.round(avgWait)} min.` : "";

      return {
        text: truncateAgenda(
          [
            `${ctx.labels.queue[0].toUpperCase()}${ctx.labels.queue.slice(1)}: ${waiting.length} ${
              waiting.length === 1 ? "pessoa" : "pessoas"
            }.`,
            waitText,
            lines.length ? `\n${lines.join("\n")}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        ),
        list: {
          kind: "QUEUE",
          items: waiting.map((item) => ({
            id: item.id,
            label: `${item.customerName} (${item.serviceName ?? ctx.labels.service})`,
          })),
        },
        suggestions: ["chamar próximo", "encerrar atendimento"],
      };
    },
  },

  {
    id: "waitlist.list",
    category: "AGENDA",
    risk: "READ",
    triggers: [
      /\b(lista de espera|espera)\b/,
      /\bquem (esta|ta) na espera\b/,
    ],
    keywords: ["lista", "espera"],
    description: "Ver a lista de espera",
    examples: ["lista de espera", "quem está esperando"],
    async run(ctx) {
      const entries = await ctx.actions.listWaitlist(ctx.actor.barbershopId, { status: "WAITING" });
      if (!entries.length) {
        return {
          text: "A lista de espera está vazia.",
          suggestions: ["agenda de hoje", "horários livres"],
        };
      }

      const lines = entries.map(
        (entry, index) =>
          `${index + 1}. ${entry.customerName} (${entry.serviceName ?? ctx.labels.service})${
            entry.whatsapp ? ` — ${maskPhone(entry.whatsapp)}` : ""
          }`
      );
      return {
        text: truncateAgenda(`Lista de espera (${entries.length}):\n${lines.join("\n")}`),
        list: {
          kind: "WAITLIST",
          items: entries.map((entry) => ({
            id: entry.id,
            label: `${entry.customerName} (${entry.serviceName ?? ctx.labels.service})`,
          })),
        },
        suggestions: ["oferecer vaga da lista de espera"],
      };
    },
  },

  {
    id: "waitlist.offer",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [
      /\boferecer (uma )?vaga\b/,
      /\bchamar (da|do) (lista de espera|espera)\b/,
      /\bvaga (da|do) lista de espera\b/,
    ],
    keywords: ["oferecer", "vaga", "espera"],
    description: "Oferecer vaga da lista de espera",
    examples: ["oferecer vaga da lista de espera"],
    async run(ctx) {
      const entries = await ctx.actions.listWaitlist(ctx.actor.barbershopId, { status: "WAITING" });
      if (!entries.length) {
        return { text: "A lista de espera está vazia.", suggestions: ["agenda de hoje"] };
      }

      return {
        text: `Para quem é a vaga?\n${numberedList(
          entries.map((entry) => ({
            label: `${entry.customerName} (${entry.serviceName ?? ctx.labels.service})`,
          }))
        )}`,
        list: {
          kind: "WAITLIST",
          items: entries.map((entry) => ({
            id: entry.id,
            label: `${entry.customerName} (${entry.serviceName ?? ctx.labels.service})`,
          })),
        },
        flow: { kind: "WAITLIST_OFFER", step: "WAITLIST_DATE" },
        suggestions: [],
      };
    },
  },

  {
    id: "waitlist.remove",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [
      /\b(remover|tirar|sacar)\b.*\b(lista de espera|espera)\b/,
      /\bsaiu da (lista de espera|espera)\b/,
    ],
    keywords: ["remover", "espera"],
    description: "Remover alguém da lista de espera",
    examples: ["remover da lista de espera"],
    async run(ctx) {
      const entries = await ctx.actions.listWaitlist(ctx.actor.barbershopId, { status: "WAITING" });
      if (!entries.length) {
        return { text: "A lista de espera está vazia.", suggestions: ["agenda de hoje"] };
      }

      return {
        text: `Quem saiu da lista de espera?\n${numberedList(
          entries.map((entry) => ({
            label: `${entry.customerName} (${entry.serviceName ?? ctx.labels.service})`,
          }))
        )}`,
        list: {
          kind: "WAITLIST",
          items: entries.map((entry) => ({
            id: entry.id,
            label: `${entry.customerName} (${entry.serviceName ?? ctx.labels.service})`,
          })),
        },
        flow: { kind: "WAITLIST_REMOVE", step: "WAITLIST_CONFIRM" },
        suggestions: [],
      };
    },
  },

  {
    id: "client.reminder",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [
      /\b(reenviar|mandar|enviar)\b.*\b(lembrete|lembranca|lembrança)\b/,
      /\blembrete (do|para o) cliente\b/,
    ],
    keywords: ["lembrete", "cliente", "reenviar"],
    description: "Reenviar lembrete ao cliente",
    examples: ["reenviar lembrete do horário de hoje"],
    async run(ctx) {
      const today = ownerBotToday(ctx.timezone, ctx.now);
      const appointments = await ctx.actions.listAppointments(ctx.actor.barbershopId, today);
      const pending = appointments.filter(
        (item) => item.status === "CONFIRMED" && item.whatsapp
      );

      if (!pending.length) {
        return {
          text: "Não há horário confirmado de hoje para mandar lembrete.",
          suggestions: ["agenda de hoje"],
        };
      }

      return {
        text: `Para quem é o lembrete?\n${numberedList(
          pending.map((item) => ({
            label: `${item.time} — ${item.customerName} (${item.serviceName ?? ctx.labels.service})`,
          }))
        )}`,
        list: {
          kind: "APPOINTMENTS",
          items: pending.map((item) => ({
            id: item.id,
            label: `${item.time} — ${item.customerName}`,
          })),
        },
        flow: { kind: "REMINDER", step: "REMINDER_CONFIRM" },
        suggestions: [],
      };
    },
  },

  // ─── Ações de appointment: entram no registry, executam pelos fluxos ───────

  {
    id: "appointment.schedule",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(agendar|agende|marcar (um )?(horario|atendimento)|novo horario)\b/],
    keywords: ["agendar", "horario", "marcar"],
    description: "Agendar um novo horário",
    examples: ["agendar um horário", "marcar corte amanhã às 10h"],
    async run() {
      return { text: "", flow: { kind: "SCHEDULE", step: "SERVICE" } };
    },
  },
  {
    id: "appointment.cancel",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(cancelar|cancele|remover (o )?horario)\b/],
    keywords: ["cancelar", "horario"],
    description: "Cancelar um horário",
    examples: ["cancelar o horário das 10h"],
    async run() {
      return { text: "", flow: { kind: "CANCEL", step: "APPOINTMENT" } };
    },
  },
  {
    id: "appointment.reschedule",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(remarcar|reagendar|mudar (a )?(data|horario|data e hora))\b/],
    keywords: ["remarcar", "reagendar", "horario"],
    description: "Remarcar um horário",
    examples: ["remarcar o horário do Pedro"],
    async run() {
      return { text: "", flow: { kind: "RESCHEDULE", step: "APPOINTMENT" } };
    },
  },
  {
    id: "appointment.checkin",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(check ?in|registrar (a )?chegada|chegou)\b/],
    keywords: ["checkin", "chegada"],
    description: "Fazer check-in de quem chegou",
    examples: ["check-in da Maria", "a Maria chegou"],
    async run() {
      return { text: "", flow: { kind: "CHECK_IN", step: "APPOINTMENT" } };
    },
  },
  {
    id: "appointment.complete",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(encerrar|finalizar|terminar|concluir)\b.*\b(atendimento|servico|consulta|sessao)\b/],
    keywords: ["encerrar", "finalizar", "atendimento"],
    description: "Encerrar atendimento e chamar o próximo",
    examples: ["encerrar atendimento", "finalizei o corte do João"],
    async run() {
      return { text: "", flow: { kind: "COMPLETE", step: "APPOINTMENT" } };
    },
  },
  {
    id: "appointment.noshow",
    category: "AGENDA",
    risk: "WRITE",
    triggers: [/\b(falta|no show|nao compareceu|nao veio|desistiu)\b/],
    keywords: ["falta", "compareceu", "desistiu"],
    description: "Marcar falta",
    examples: ["marcar falta do Pedro", "a Maria não veio"],
    async run() {
      return { text: "", flow: { kind: "NO_SHOW", step: "APPOINTMENT" } };
    },
  },
];

function statusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "confirmado";
    case "CHECKED_IN":
      return "na fila";
    case "COMPLETED":
      return "concluído";
    case "CANCELLED":
      return "cancelado";
    case "NO_SHOW":
      return "falta";
    default:
      return status;
  }
}

function truncateAgenda(text: string): string {
  return text.length > 1400 ? `${text.slice(0, 1397)}...` : text;
}

export { formatBRL, suggestionsLine };
