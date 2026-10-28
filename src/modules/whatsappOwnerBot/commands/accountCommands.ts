import { maskPhone } from "../messages";
import { formatBRL } from "./money";
import { OWNER_BOT_ALERT_LABELS } from "../ownerBotPreferences";
import { numberedList, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de conta: unidades, plano, histórico, preferências e bloqueio.
 */
export const accountCommands: OwnerBotCommand[] = [
  {
    id: "account.units",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(unidades|estabelecimentos|salos|saloes|lojas)\b/,
      /\b(trocar de unidade|trocar unidade|outra unidade|outro salao)\b/,
    ],
    keywords: ["unidades", "trocar", "estabelecimento"],
    description: "Trocar de unidade",
    examples: ["trocar de unidade", "quais unidades eu tenho"],
    async run(ctx) {
      const shops = ctx.linkedShops;
      if (!shops.length) {
        return { text: "Você não tem unidades vinculadas.", suggestions: ["ajuda"] };
      }
      if (shops.length === 1) {
        return {
          text: `Você está falando com ${shops[0].name}.`,
          suggestions: ["ajuda", "agenda de hoje"],
        };
      }
      return {
        text: `Qual unidade?\n${numberedList(shops.map((shop) => ({ label: shop.name })))}`,
        list: {
          kind: "SHOPS",
          items: shops.map((shop) => ({ id: shop.id, label: shop.name })),
        },
        suggestions: [],
      };
    },
  },

  {
    id: "account.plan",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(status do plano|meu plano|assinatura|plano|vencimento|pagamento da assinatura)\b/,
      /\b(quando|ate quando)\b.*\b(venc|assinatura)\b/,
    ],
    keywords: ["plano", "assinatura", "vencimento"],
    description: "Status do plano e assinatura",
    examples: ["status do meu plano", "quando vence a assinatura"],
    async run(ctx) {
      const status = await ctx.actions.subscriptionStatus(ctx.actor.barbershopId);
      if (!status.active) {
        return {
          text: "Seu plano está sem acesso ativo. Regularize a assinatura para usar todos os recursos.",
          suggestions: ["ajuda", "faturamento do mês"],
        };
      }

      const lines = [
        `Plano: ${status.planName ?? "em avaliação"}${status.price ? ` — ${formatBRL(status.price)}` : ""}`,
        `Situação: ${status.status ?? "ativo"}`,
        status.inTrial
          ? `Teste grátis até ${status.trialEndsAt?.toLocaleDateString("pt-BR")}`
          : null,
        status.endDate ? `Vence em ${status.endDate.toLocaleDateString("pt-BR")}` : null,
      ].filter(Boolean) as string[];

      return { text: lines.join("\n"), suggestions: ["ajuda", "faturamento do mês"] };
    },
  },

  {
    id: "account.history",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(historico|historico)\b/,
      /\b(o que (o assistente|voce) (fez| fiz))\b/,
      /\bminhas acoes\b/,
      /\bultimas acoes\b/,
    ],
    keywords: ["historico", "acoes", "fez"],
    description: "Histórico de ações do assistente",
    examples: ["histórico", "o que o assistente fez"],
    async run(ctx) {
      const logs = await ctx.actions.actionLogs(ctx.actor.barbershopId, 10);
      if (!logs.length) {
        return {
          text: "Ainda não tenho ações registradas por aqui.",
          suggestions: ["ajuda", "agenda de hoje"],
        };
      }

      const lines = logs.map((log, index) => {
        const when = new Date(log.createdAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${index + 1}. ${when} — ${log.commandId ?? log.action} [${log.riskClass ?? "-"}] ${
          log.status
        }`;
      });

      return {
        text: `Últimas ações:\n${lines.join("\n")}`,
        suggestions: ["ajuda"],
      };
    },
  },

  {
    id: "account.preferences",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(configurar assistente|configuracoes do assistente|preferencias|ajustar o bot)\b/,
      /\b(briefing|resumo do dia|alertas)\b.*\b(ligar|desligar|ativar|desativar|horario)\b/,
    ],
    keywords: ["configurar", "assistente", "preferencias"],
    description: "Configurar o assistente (briefing, alertas, tom)",
    examples: ["configurar assistente", "ligar o briefing diário"],
    async run(ctx, entities) {
      const prefs = ctx.preferences;

      if (/briefing/.test(entities.raw)) {
        const enable = !/desligar|desativa|parar/.test(entities.raw);
        const time = entities.time;
        await ctx.actions.updatePreferences(ctx.actor.barbershopId, {
          briefingEnabled: enable,
          ...(time ? { briefingTime: time } : {}),
        });
        return {
          text: `Briefing diário ${enable ? "ligado" : "desligado"}${
            time ? ` para ${time}` : ""
          }.`,
          suggestions: ["configurar assistente"],
        };
      }

      if (/alerta/.test(entities.raw)) {
        const enable = !/desligar|desativa/.test(entities.raw);
        await ctx.actions.updatePreferences(ctx.actor.barbershopId, { alertsEnabled: enable });
        return {
          text: `Alertas ${enable ? "ligados" : "desligados"}.`,
          suggestions: ["configurar assistente"],
        };
      }

      if (/tom/.test(entities.raw)) {
        const formal = /formal/.test(entities.raw);
        await ctx.actions.updatePreferences(ctx.actor.barbershopId, {
          tone: formal ? "FORMAL" : "FRIENDLY",
        });
        return {
          text: `Tom ${formal ? "formal" : "descontraído"} ativado.`,
          suggestions: ["configurar assistente"],
        };
      }

      const alertLines = Object.entries(OWNER_BOT_ALERT_LABELS)
        .map(([type, label]) => `• ${label}${prefs.alertTypes.includes(type as never) ? " ✔" : ""}`)
        .join("\n");

      return {
        text: [
          "Preferências do assistente:",
          `• Briefing diário: ${prefs.briefingEnabled ? `ligado (${prefs.briefingTime})` : "desligado"}`,
          `• Resumo de fim de dia: ${
            prefs.summaryEnabled ? `ligado (${prefs.summaryTime})` : "desligado"
          }`,
          `• Alertas: ${prefs.alertsEnabled ? "ligados" : "desligados"}`,
          `• Tom: ${prefs.tone === "FORMAL" ? "formal" : "descontraído"}`,
          "",
          "Alertas disponíveis:",
          alertLines,
          "",
          "Exemplos: \"ligar o briefing às 7:30\", \"desligar alertas\", \"tom formal\".",
        ].join("\n"),
        suggestions: ["ajuda", "status do plano"],
      };
    },
  },

  {
    id: "account.block",
    category: "CONTA",
    risk: "WRITE",
    triggers: [
      /\b(bloquear (o )?assistente|desativar (o )?assistente|desligar (o )?assistente)\b/,
    ],
    keywords: ["bloquear", "assistente", "desligar"],
    description: "Bloquear o assistente neste estabelecimento",
    examples: ["bloquear assistente"],
    async run(ctx) {
      const summary = "Bloquear o assistente neste estabelecimento";
      if (!ctx.confirmed) {
        return {
          text: `${summary}?\n\nO WhatsApp deixa de responder até você reativar.\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }
      await ctx.actions.updatePreferences(ctx.actor.barbershopId, {
        blocked: true,
        blockedAt: ctx.now,
      });
      return {
        text: "Assistente bloqueado. Você pode reativar pela seção do app quando quiser.",
        suggestions: [],
      };
    },
  },

  {
    id: "account.unlink",
    category: "CONTA",
    risk: "WRITE",
    triggers: [
      /\b(desvincular|desligar (o )?(numero|vinculo)|sair do assistente)\b/,
    ],
    keywords: ["desvincular", "vinculo", "sair"],
    description: "Desvincular este número",
    examples: ["desvincular"],
    async run() {
      return { text: "", flow: { kind: "UNLINK", step: "CONFIRM" } };
    },
  },

  {
    id: "account.about",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(sobre|quem e voce|quem é voce|seu nome|como voce funciona)\b/,
    ],
    keywords: ["sobre", "assistente", "funciona"],
    description: "Sobre o assistente",
    examples: ["sobre", "quem é você"],
    async run(ctx) {
      return {
        text: [
          `Sou o assistente do ${ctx.link.barbershopName} no WhatsApp.`,
          "",
          "Eu executo o mesmo que o app: agenda, clientes, financeiro, equipe, estoque e operação.",
          "Para qualquer ação que altere algo, eu mostro o resumo e peço sua confirmação antes.",
          "",
          `Seu número vinculado: ${maskPhone(ctx.link.normalizedPhone)}`,
          "Envie \"ajuda\" para ver todos os comandos.",
        ].join("\n"),
        suggestions: ["ajuda", "agenda de hoje"],
      };
    },
  },
];

export { suggestionsLine };
