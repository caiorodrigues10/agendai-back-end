import type { OwnerBotCommand } from "./types";

/**
 * Comandos de gestão de processos (segmento LAW_FIRM).
 *
 * Sigilo: o assistente responde ao **dono**, mas por canal de mensagem. Por
 * isso os comandos de processo mostram apenas o que o dono precisa para
 * agir — título, data e dias restantes. Apelido de caso, número de processo
 * e nome do cliente **não** aparecem aqui.
 */
export const caseCommands: OwnerBotCommand[] = [
  {
    id: "case.deadlines",
    category: "PROCESSOS",
    risk: "READ",
    segments: ["LAW_FIRM"],
    triggers: [
      /\bprazos?\b/,
      /\b(prazos?|vencimento|vencimentos)\b.*\b(processo|casos?|escritorio)\b/,
      /\bprocesso\b.*\b(prazo|vencimento)\b/,
      /\b(que|quais) prazos\b/,
      /\bcontestacao\b.*\b(prazo|data)\b/,
    ],
    keywords: ["prazos", "vencimento", "processo"],
    description: "Ver os próximos prazos",
    examples: ["quais os prazos", "prazos da semana"],
    async run(ctx, entities) {
      const days = extractDays(entities.raw);
      const deadlines = await ctx.actions.listUpcomingDeadlines(ctx.actor.barbershopId, {
        days,
        limit: 10,
      });

      if (!deadlines.length) {
        return {
          text: `Não há prazo pendente nos próximos ${days} dias.`,
          suggestions: ["tarefas abertas", "agenda de hoje"],
        };
      }

      const lines = deadlines.map((deadline, index) => {
        const when = formatDue(deadline.dueDate);
        const remaining =
          deadline.daysRemaining === null
            ? ""
            : deadline.daysRemaining < 0
              ? ` (${Math.abs(deadline.daysRemaining)} dias úteis de atraso)`
              : deadline.daysRemaining === 0
                ? " (vence hoje)"
                : ` (faltam ${deadline.daysRemaining} dias úteis)`;
        return `${index + 1}. ${when} — ${deadline.title}${remaining}`;
      });

      return {
        text: `Prazos próximos:\n${lines.join("\n")}`,
        list: {
          kind: "DEADLINES",
          items: deadlines.map((deadline) => ({
            id: deadline.id,
            label: `${formatDue(deadline.dueDate)} — ${deadline.title}`,
          })),
        },
        suggestions: ["tarefas abertas", "agenda de hoje", "resumo do mês"],
      };
    },
  },
  {
    id: "case.tasks",
    category: "PROCESSOS",
    risk: "READ",
    segments: ["LAW_FIRM"],
    triggers: [
      /\btarefas?\b/,
      /\bpendencias?\b/,
      /\b(oque|o que) (falta|precisa|fazer)\b/,
      /\bchecklist\b/,
    ],
    keywords: ["tarefas", "pendencias", "fazer"],
    description: "Ver as tarefas abertas",
    examples: ["quais as tarefas", "o que falta fazer"],
    async run(ctx) {
      const tasks = await ctx.actions.listOpenCaseTasks(ctx.actor.barbershopId, { limit: 10 });

      if (!tasks.length) {
        return {
          text: "Nenhuma tarefa aberta no momento.",
          suggestions: ["quais os prazos", "agenda de hoje"],
        };
      }

      const lines = tasks.map((task, index) => {
        const due = task.dueDate ? ` — até ${formatDue(task.dueDate)}` : "";
        return `${index + 1}. ${task.title}${due}`;
      });

      return {
        text: `Tarefas abertas:\n${lines.join("\n")}`,
        list: {
          kind: "TASKS",
          items: tasks.map((task) => ({ id: task.id, label: task.title })),
        },
        suggestions: ["quais os prazos", "agenda de hoje"],
      };
    },
  },
  {
    id: "case.pipeline",
    category: "PROCESSOS",
    risk: "READ",
    segments: ["LAW_FIRM"],
    triggers: [
      /\b(processos|casos)\b.*\b(quantos|resumo|situacao|status|andamento)\b/,
      /\bquantos (processos|casos)\b/,
      /\bquadro\b.*\b(processos|casos)\b/,
    ],
    keywords: ["processos", "casos", "quadro"],
    description: "Resumo dos processos por situação",
    examples: ["quantos processos tenho", "resumo dos processos"],
    async run(ctx) {
      const counts = await ctx.actions.casePipeline(ctx.actor.barbershopId);
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

      if (!total) {
        return {
          text: "Nenhum processo cadastrado ainda.",
          suggestions: ["quais os prazos", "tarefas abertas"],
        };
      }

      const labels: Record<string, string> = {
        LEAD: "prospecção",
        ACTIVE: "em andamento",
        AWAITING_CLIENT: "aguardando o cliente",
        IN_COURT: "em fase judicial",
        SUSPENDED: "paralisado",
        CLOSED: "encerrado",
        ARCHIVED: "arquivado",
      };

      const lines = Object.entries(counts)
        .filter(([, value]) => value > 0)
        .map(([status, value]) => `• ${labels[status] ?? status}: ${value}`);

      return {
        text: `Processos do escritório (${total} no total):\n${lines.join("\n")}`,
        suggestions: ["quais os prazos", "tarefas abertas", "resumo do mês"],
      };
    },
  },
  {
    id: "case.intimations",
    category: "PROCESSOS",
    risk: "READ",
    segments: ["LAW_FIRM"],
    triggers: [
      /\bintima(cao|cões|coes)\b/,
      /\b(andamentos? (do|no) (pje|tribunal|processo))\b/,
      /\b(chegou|chegaram) (alguma )?(intimacao|notificacao)\b/,
      /\bnotificacoes? do (tribunal|pje)\b/,
    ],
    keywords: ["intimacao", "intimacoes", "tribunal", "pje"],
    description: "Ver as intimações que aguardam triagem",
    examples: ["quais intimações chegaram", "intimações do tribunal"],
    async run(ctx) {
      const intimations = await ctx.actions.listPendingIntimations(
        ctx.actor.barbershopId,
        { limit: 10 }
      );

      if (!intimations.length) {
        return {
          text: "Nenhuma intimação aguardando triagem.",
          suggestions: ["quais os prazos", "tarefas abertas"],
        };
      }

      const lines = intimations.map((intimation, index) => {
        const source = sourceLabel(intimation.source);
        return `${index + 1}. ${formatDue(intimation.receivedAt)} — ${intimation.subject} (${source})`;
      });

      return {
        text: `Intimações aguardando triagem:\n${lines.join("\n")}`,
        list: {
          kind: "INTIMATIONS",
          items: intimations.map((intimation) => ({
            id: intimation.id,
            label: intimation.subject,
          })),
        },
        suggestions: ["quais os prazos", "tarefas abertas"],
      };
    },
  },
];

/** Rótulos de origem da intimação. */
function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    EMAIL: "email",
    WHATSAPP: "WhatsApp",
    MANUAL: "manual",
    IMPORT: "importação",
  };
  return labels[source] ?? source;
}

/** "prazos de 15 dias" → 15; padrão 15 dias. */
function extractDays(raw: string): number {
  const match = raw.match(/(\d{1,3})\s*(dias|semanas)/);
  if (!match) return 15;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 15;
  return match[2] === "semanas" ? value * 7 : Math.min(value, 180);
}

/** Data em `DD/MM` (ou "hoje"/"amanhã" quando aplicável). */
function formatDue(dueDate: string): string {
  const date = new Date(`${dueDate}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}
