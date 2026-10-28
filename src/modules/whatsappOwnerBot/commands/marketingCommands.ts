import { maskPhone } from "../messages";
import { formatBRL } from "./money";
import { findByName, numberedList, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de reputação e marketing.
 *
 * Envios em lote sempre passam por confirmação e respeitam o opt-out do
 * cliente (o envio usa a fila de notificações do app).
 */
export const marketingCommands: OwnerBotCommand[] = [
  {
    id: "rep.rating",
    category: "MARKETING",
    risk: "READ",
    triggers: [
      /\b(nota media|nota média|reputacao|reputação|avaliacao media|como estou avaliado)\b/,
      /\b(quanto|qual) (minha )?(nota|avaliacao)\b/,
    ],
    keywords: ["nota", "reputacao", "avaliacao"],
    description: "Nota média e reputação",
    examples: ["qual minha nota", "como está minha reputação"],
    async run(ctx) {
      const reputation = await ctx.actions.reputation(ctx.actor.barbershopId, ctx.actor);
      const avg = Number(reputation.avgRating ?? 0);
      const total = Number(reputation.totalReviews ?? 0);

      if (!total) {
        return {
          text: "Ainda não há avaliações publicadas.",
          suggestions: ["pedir avaliação", "clientes sumidos"],
        };
      }

      const nps = reputation.npsScore;
      return {
        text: [
          `Nota média: ${avg.toFixed(1).replace(".", ",")} ⭐ (${total} ${
            total === 1 ? "avaliação" : "avaliações"
          })`,
          nps !== null && nps !== undefined ? `NPS: ${Math.round(Number(nps))}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        suggestions: ["últimas avaliações", "pedir avaliação"],
      };
    },
  },

  {
    id: "rep.reviews",
    category: "MARKETING",
    risk: "READ",
    triggers: [
      /\b(ultimas avaliacoes|últimas avaliações|avaliacoes|avaliações|opinioes|opiniões)\b/,
      /\b(ver|ler) (as )?avaliacoes\b/,
    ],
    keywords: ["avaliacoes", "opinioes", "reviews"],
    description: "Últimas avaliações recebidas",
    examples: ["últimas avaliações"],
    async run(ctx) {
      const reviews = await ctx.actions.recentReviews(ctx.actor.barbershopId, 5);
      if (!reviews.length) {
        return {
          text: "Nenhuma avaliação publicada ainda.",
          suggestions: ["pedir avaliação", "nota média"],
        };
      }

      const lines = reviews.map((review, index) => {
        const stars = review.rating ? "⭐".repeat(Math.max(1, Math.round(review.rating))) : "⭐";
        const comment = review.comment ? ` — ${review.comment.slice(0, 120)}` : "";
        return `${index + 1}. ${stars} ${review.authorName ?? "cliente"}${comment}`;
      });

      return {
        text: `Últimas avaliações:\n${lines.join("\n")}`,
        suggestions: ["nota média", "responder avaliação"],
      };
    },
  },

  {
    id: "rep.request",
    category: "MARKETING",
    risk: "WRITE",
    triggers: [
      /\b(pedir|solicitar|pedido|convidar)\b.*\b(avaliacao|avaliação|review)\b/,
      /\bavaliacao\b.*\b(cliente|para o)\b/,
    ],
    keywords: ["pedir", "avaliacao", "review"],
    description: "Pedir avaliação a um cliente",
    examples: ["pedir avaliação para a Maria"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 8,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);
      if (!match) {
        return {
          text: `Para qual ${ctx.labels.client}?\n${numberedList(
            clients.map((item) => ({ label: `${item.name} — ${maskPhone(item.whatsapp)}` }))
          )}`,
          list: {
            kind: "CLIENTS",
            items: clients.map((item) => ({ id: item.id, label: item.name })),
          },
          suggestions: [],
        };
      }

      const summary = `Pedir avaliação para ${match.item.name} (${maskPhone(match.item.whatsapp)})`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      const sent = await ctx.actions.sendToShopClient(
        ctx.actor.barbershopId,
        match.item.whatsapp,
        `Olá ${match.item.name}! Ficou tudo bem com seu último atendimento? Deixa uma avaliação? Obrigado!`,
        { clientId: match.item.id, type: "REVIEW_REQUEST" }
      );

      if (!sent.ok) {
        return {
          text: `Não consegui enviar agora: ${sent.error ?? "WhatsApp indisponível"}.`,
          suggestions: ["avaliações pendentes"],
        };
      }

      return {
        text: `Pedido de avaliação enviado para ${match.item.name}.`,
        affectedIds: [match.item.id],
        suggestions: ["nota média", "clientes sumidos"],
      };
    },
  },

  {
    id: "campaign.inactive",
    category: "MARKETING",
    risk: "SENSITIVE",
    triggers: [
      /\b(campanha|mensagem em massa|aviso em massa)\b.*\b(sumidos|inativos|clientes)\b/,
      /\b(mandar|enviar)\b.*\b(tudo|todos os clientes|clientes sumidos)\b/,
    ],
    keywords: ["campanha", "clientes", "sumidos"],
    description: "Campanha para clientes sumidos",
    examples: ["campanha para clientes sumidos"],
    async run(ctx) {
      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "90d");
      const inactive = insights.inactiveCustomers ?? [];
      if (!inactive.length) {
        return {
          text: "Nenhum cliente sumido nos últimos 90 dias — não há campanha para fazer.",
          suggestions: ["clientes sumidos", "faturamento do mês"],
        };
      }

      const message = `Oi! Passando para saber como você está. Gostaria de agendar um horário com a gente? 😊`;
      const summary = `Enviar campanha para ${inactive.length} clientes sumidos: "${message}"`;

      if (!ctx.confirmed) {
        return {
          text:
            `${summary}\n\n⚠️ Serão ${inactive.length} mensagens pelo WhatsApp do salão.\n` +
            "Para confirmar, digite CONFIRMAR.",
          confirmation: { summary, strong: true },
        };
      }

      const sent = await ctx.actions.sendCampaignToClients(
        ctx.actor.barbershopId,
        inactive.map((client) => ({ phone: client.whatsapp, name: client.customerName })),
        message,
        { type: "CAMPAIGN", respectOptOut: true }
      );

      return {
        text: `Campanha disparada: ${sent.sent} de ${inactive.length} mensagens enviadas.${
          sent.failed ? ` ${sent.failed} falharam.` : ""
        }`,
        suggestions: ["clientes sumidos", "faturamento do mês"],
      };
    },
  },
];

export { suggestionsLine, formatBRL };
