import { formatBRL } from "./money";
import { ownerBotToday } from "./periods";
import { findByName, numberedList, periodOrDefault, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de equipe: quem trabalha hoje, ranking, comissões e folgas.
 */
export const staffCommands: OwnerBotCommand[] = [
  {
    id: "team.today",
    category: "EQUIPE",
    risk: "READ",
    triggers: [
      /\b(quem (esta|ta) (trabalhando|atendendo)|equipe de hoje|equipe hoje)\b/,
      /\b(trabalhadores|funcionarios)\b.*\b(hoje|de hoje)\b/,
      /\b(escala|turno)\b.*\bhoje\b/,
    ],
    keywords: ["equipe", "trabalhando", "hoje"],
    description: "Quem está trabalhando hoje",
    examples: ["quem está trabalhando hoje", "equipe de hoje"],
    async run(ctx) {
      const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
      if (!staff.length) {
        return { text: "Não há profissionais cadastrados.", suggestions: ["agenda de hoje"] };
      }

      const today = ownerBotToday(ctx.timezone, ctx.now);
      const [appointments, timeOff] = await Promise.all([
        ctx.actions.listAppointments(ctx.actor.barbershopId, today),
        ctx.actions.listTimeOff(ctx.actor.barbershopId, { status: "APPROVED" }),
      ]);

      const absentToday = new Set(
        timeOff
          .filter((entry) => {
            const start = new Date(entry.startAt).toISOString().slice(0, 10);
            const end = new Date(entry.endAt).toISOString().slice(0, 10);
            return start <= today && end >= today;
          })
          .map((entry) => entry.staffId)
      );

      const lines = staff.map((member, index) => {
        const mine = appointments.filter(
          (item) => item.staffId === member.id && item.status !== "CANCELLED"
        );
        const status = absentToday.has(member.id)
          ? "folga"
          : mine.length
            ? `${mine.length} ${mine.length === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`}`
            : "sem ${ctx.labels.appointment === 'agenda' ? 'horários' : 'atendimentos'}";
        return `${index + 1}. ${member.name} — ${status}`;
      });

      return {
        text: `Equipe de hoje:\n${lines.join("\n")}`,
        list: {
          kind: "STAFF",
          items: staff.map((member) => ({ id: member.id, label: member.name })),
        },
        suggestions: ["ranking do mês", "comissões do mês", "folgas"],
      };
    },
  },

  {
    id: "team.ranking",
    category: "EQUIPE",
    risk: "READ",
    triggers: [
      /\b(ranking|quem (vence|mais vende|mais produz)|melhor (profissional|colaborador))\b/,
      /\b(produtividade|desempenho)\b/,
    ],
    keywords: ["ranking", "profissional", "produtividade"],
    description: "Ranking do mês por faturamento",
    examples: ["ranking do mês", "quem mais produziu"],
    async run(ctx) {
      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "30d");
      const ranking = [...insights.byStaff].sort((a, b) => b.revenue - a.revenue);
      if (!ranking.length) {
        return {
          text: "Ainda não tenho atendimentos concluídos para montar o ranking.",
          suggestions: ["equipe hoje", "comissões do mês"],
        };
      }

      const lines = ranking.map(
        (item, index) =>
          `${index + 1}. ${item.name} — ${formatBRL(item.revenue)} em ${item.count} ${
            item.count === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`
          }`
      );

      return {
        text: `Ranking (últimos 30 dias):\n${lines.join("\n")}`,
        suggestions: ["comissões do mês", "faturamento do mês"],
      };
    },
  },

  {
    id: "team.commission",
    category: "EQUIPE",
    risk: "READ",
    triggers: [
      /\bcomissao (do|da)\b/,
      /\bquanto (o|a) \w+ tem (a receber|ganhar)\b/,
    ],
    keywords: ["comissao", "profissional", "receber"],
    description: "Comissão de um profissional",
    examples: ["comissão da Ana", "quanto o João tem a receber"],
    async run(ctx, entities) {
      const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
      const match = findByName(staff, entities.staffName, (item) => item.name);
      if (!match) {
        return {
          text: `Quem?\n${numberedList(staff.map((item) => ({ label: item.name })))}`,
          list: { kind: "STAFF", items: staff.map((item) => ({ id: item.id, label: item.name })) },
          suggestions: [],
        };
      }

      const period = periodOrDefault(entities, ctx, "month");
      const summary = await ctx.actions.commissionSummary(ctx.actor.barbershopId, {
        from: period.from.toISOString().slice(0, 10),
        to: period.to.toISOString().slice(0, 10),
        professionalId: match.item.id,
      });

      const total = summary.byProfessional[0]?.commissionTotal ?? 0;
      const entries = summary.byProfessional[0]?.entryCount ?? 0;

      return {
        text: `${match.item.name} tem ${formatBRL(total)} de comissão em ${period.label} (${
          entries
        } ${entries === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`}).`,
        suggestions: ["ranking do mês", "equipe hoje"],
      };
    },
  },

  {
    id: "team.timeoff",
    category: "EQUIPE",
    risk: "READ",
    triggers: [
      /\b(folgas?|ausencias?|ausência|ferias|férias|time off)\b/,
      /\bquem (esta|ta) (de folga|ausente|afastado)\b/,
    ],
    keywords: ["folga", "ausencia", "ferias"],
    description: "Folgas e ausências da equipe",
    examples: ["folgas da semana", "quem está de folga"],
    async run(ctx) {
      const entries = await ctx.actions.listTimeOff(ctx.actor.barbershopId, {});
      if (!entries.length) {
        return {
          text: "Nenhuma folga ou ausência registrada.",
          suggestions: ["equipe hoje", "lançar folga"],
        };
      }

      const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
      const nameOf = (staffId: string) =>
        staff.find((member) => member.id === staffId)?.name ?? "profissional";

      const lines = entries.slice(0, 10).map((entry, index) => {
        const start = new Date(entry.startAt).toLocaleDateString("pt-BR");
        const end = new Date(entry.endAt).toLocaleDateString("pt-BR");
        return `${index + 1}. ${nameOf(entry.staffId)} — ${start} até ${end}${
          entry.reason ? ` (${entry.reason})` : ""
        }`;
      });

      return {
        text: `Folgas e ausências:\n${lines.join("\n")}`,
        suggestions: ["equipe hoje", "lançar folga"],
      };
    },
  },

  {
    id: "team.timeoff.create",
    category: "EQUIPE",
    risk: "WRITE",
    triggers: [
      /\b(lancar|lance|registrar|marcar|criar)\b.*\b(folga|ausencia|ausência)\b/,
      /\b(folga|ausencia) (do|da)\b/,
    ],
    keywords: ["folga", "ausencia", "lancar"],
    description: "Lançar folga de um profissional",
    examples: ["folga da Ana sexta", "lançar folga do João na sexta"],
    async run(ctx, entities) {
      const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
      const match = findByName(staff, entities.staffName, (item) => item.name);
      if (!match) {
        return {
          text: `De quem é a folga?\n${numberedList(staff.map((item) => ({ label: item.name })))}`,
          list: { kind: "STAFF", items: staff.map((item) => ({ id: item.id, label: item.name })) },
          suggestions: [],
        };
      }

      const date = entities.date;
      if (!date) {
        return {
          text: `Qual dia de folga de ${match.item.name}? (ex.: 28/10 ou "sexta")`,
          flow: {
            kind: "COMMAND",
            step: "DATE",
            commandId: "team.timeoff.create",
            entities: { staffId: match.item.id, staffName: match.item.name },
          },
          suggestions: [],
        };
      }

      const summary = `Lançar folga de ${match.item.name} em ${date}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.requestTimeOff(ctx.actor.barbershopId, {
        staffId: match.item.id,
        startAt: `${date}T00:00:00.000Z`,
        endAt: `${date}T23:59:59.000Z`,
        reason: null,
      });

      return {
        text: `Folga de ${match.item.name} em ${date} registrada.`,
        affectedIds: [match.item.id],
        suggestions: ["folgas", "equipe hoje"],
      };
    },
  },
];

export { suggestionsLine };
