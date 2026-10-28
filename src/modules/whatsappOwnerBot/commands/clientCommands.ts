import { normalizeText } from "../dateParser";
import { maskPhone } from "../messages";
import { formatBRL } from "./money";
import { findByName, numberedList, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de CRM: busca, ficha, cadastro, histórico, pacotes, fiado e
 * mensagens para o cliente (sempre pela instância do salão).
 *
 * Dados de saúde (fisio, nutrição, psicologia) nunca entram aqui: o bot
 * enxerga agenda e relacionamento, não prontuário.
 */
export const clientCommands: OwnerBotCommand[] = [
  {
    id: "client.search",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(quem e|qual e|sobre|info|informacoes|ficha)\b.*\b(cliente|paciente|aluno|tutor)\b/,
      /\bcliente\b.*\b(quem e|qual e)\b/,
      /\b(consultar|buscar|procurar)\b.*\bcliente\b/,
    ],
    keywords: ["cliente", "quem", "ficha"],
    description: "Buscar um cliente",
    examples: ["quem é a Maria?", "ficha do João"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);

      if (!match) {
        if (!clients.length) {
          return {
            text: `Não encontrei nenhum ${ctx.labels.client} com esse nome.`,
            suggestions: ["cadastrar cliente", "clientes sumidos"],
          };
        }
        return {
          text: `Qual ${ctx.labels.client}?\n${numberedList(
            clients.map((item) => ({ label: `${item.name} — ${maskPhone(item.whatsapp)}` }))
          )}`,
          list: {
            kind: "CLIENTS",
            items: clients.map((item) => ({ id: item.id, label: item.name })),
          },
          suggestions: [],
        };
      }

      const client = match.item;
      const packages = await ctx.actions.listClientPackages(ctx.actor.barbershopId, client.id);
      const active = packages.filter((pkg) => pkg.status === "ACTIVE");
      const sessions = active.reduce((sum, pkg) => sum + (pkg.remainingSessions ?? 0), 0);

      const lines = [
        `${client.name}${client.whatsapp ? ` — ${maskPhone(client.whatsapp)}` : ""}`,
        client.notes ? `Observações: ${client.notes}` : null,
        sessions > 0 ? `Pacotes: ${sessions} sessões disponíveis` : null,
        active.length
          ? `Pacotes ativos: ${active
              .map((pkg) => `${pkg.packageName ?? "pacote"} (${pkg.remainingSessions ?? 0})`)
              .join(", ")}`
          : null,
      ].filter(Boolean) as string[];

      return {
        text: lines.join("\n"),
        suggestions: ["histórico do cliente", "fiado do cliente", "visitas do cliente"],
      };
    },
  },

  {
    id: "client.visits",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(historico|historico)\b.*\b(cliente|paciente|aluno|tutor)\b/,
      /\b(quantas vezes|quantas vezes veio|visitas)\b/,
      /\bultima visita\b/,
      /\bquantos atendimentos\b/,
    ],
    keywords: ["historico", "visitas", "ultima"],
    description: "Histórico e última visita do cliente",
    examples: ["histórico da Maria", "quantas vezes o João veio"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);
      if (!match) {
        return {
          text: `Não encontrei esse ${ctx.labels.client}.`,
          suggestions: ["buscar cliente"],
        };
      }

      const detail = await ctx.actions.getClient(match.item.id, ctx.actor);
      const appointments = detail.appointments ?? [];
      const completed = appointments.filter((item) => item.status === "COMPLETED");
      const last = completed.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      const lines = [
        `${detail.name}: ${completed.length} ${
          completed.length === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`
        } concluídos.`,
        last
          ? `Última visita: ${new Date(last.date).toLocaleDateString("pt-BR")} — ${
              last.serviceName ?? ctx.labels.service
            }`
          : "Sem visitas concluídas registradas.",
      ];

      return {
        text: lines.join("\n"),
        suggestions: ["melhores clientes", "clientes sumidos"],
      };
    },
  },

  {
    id: "client.inactive",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(clientes? sumid|sumid|sumiram|nao vem(em)?|pararam de vir|inativos|faz tempo que nao)\b/,
      /\bclientes?\b.*\b(30|45|60) dias\b/,
    ],
    keywords: ["clientes", "sumidos", "inativos"],
    description: "Clientes que não vêm há um tempo",
    examples: ["clientes sumidos", "quem não vem há 45 dias"],
    async run(ctx) {
      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "90d");
      const inactive = insights.inactiveCustomers ?? [];

      if (!inactive.length) {
        return {
          text: "Nenhum cliente sumido nos últimos 90 dias. 🎉",
          suggestions: ["melhores clientes", "faturamento do mês"],
        };
      }

      const lines = inactive
        .slice(0, 10)
        .map(
          (client, index) =>
            `${index + 1}. ${client.customerName} — ${client.daysSince} dias sem vir (${
              client.visits
            } ${client.visits === 1 ? "visita" : "visitas"})`
        );

      return {
        text: `Clientes sumidos (${inactive.length}):\n${lines.join("\n")}`,
        suggestions: ["campanha para clientes sumidos", "faturamento do mês"],
      };
    },
  },

  {
    id: "client.top",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(melhores clientes|clientes que mais gastam|top (de )?clientes|clientes valiosos|clientes frequentes)\b/,
      /\branking de clientes\b/,
    ],
    keywords: ["melhores", "clientes", "gastam"],
    description: "Melhores clientes",
    examples: ["melhores clientes", "quem mais gasta"],
    async run(ctx) {
      const clients = await ctx.actions.listCrmClients(
        ctx.actor.barbershopId,
        { sort: "ltv", limit: 10 },
        ctx.actor
      );

      if (!clients.length) {
        return {
          text: "Ainda não tenho histórico suficiente para ranquear clientes.",
          suggestions: ["faturamento do mês", "clientes sumidos"],
        };
      }

      const lines = clients.map((client, index) => {
        const spend = typeof client.totalSpend === "number" ? ` — ${formatBRL(client.totalSpend)}` : "";
        const visits = typeof client.totalVisits === "number" ? ` (${client.totalVisits} visitas)` : "";
        return `${index + 1}. ${client.name}${visits}${spend}`;
      });

      return {
        text: `Melhores clientes:\n${lines.join("\n")}`,
        suggestions: ["clientes sumidos", "faturamento do mês"],
      };
    },
  },

  {
    id: "client.fiado",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(fiado|dividas?|deve|devendo|emprestimo)\b.*\b(cliente|da|do)\b/,
      /\bquanto\b.*\bdeve\b/,
    ],
    keywords: ["fiado", "deve", "divida"],
    description: "Dívida (fiado) do cliente",
    examples: ["quanto a Maria deve", "fiado do João"],
    async run(ctx, entities) {
      const fiados = await ctx.actions.listFiados(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(fiados, entities.clientName, (item) => item.customerName);

      if (!match) {
        const open = await ctx.actions.listFiados(ctx.actor.barbershopId, { limit: 50 });
        const pending = open.filter((item) => item.status === "PENDING" || item.status === "PARTIAL");
        if (!pending.length) {
          return {
            text: "Nenhum fiado em aberto.",
            suggestions: ["faturamento do mês", "caixa de hoje"],
          };
        }
        const lines = pending.map(
          (item, index) =>
            `${index + 1}. ${item.customerName} — ${formatBRL(item.remainingAmount)}${
              item.isOverdue ? " (vencido)" : ""
            }`
        );
        return {
          text: `Fiados em aberto:\n${lines.join("\n")}`,
          suggestions: ["receber fiado", "faturamento do mês"],
        };
      }

      const fiado = match.item;
      const daysLate = fiado.dueDate
        ? Math.max(
            0,
            Math.floor((ctx.now.getTime() - new Date(fiado.dueDate).getTime()) / 86_400_000)
          )
        : 0;

      return {
        text: [
          `${fiado.customerName} deve ${formatBRL(fiado.remainingAmount)} (${fiado.description}).`,
          fiado.dueDate
            ? `Vencimento: ${new Date(fiado.dueDate).toLocaleDateString("pt-BR")}${
                daysLate > 0 ? ` — ${daysLate} dias em atraso` : ""
              }`
            : "Sem data de vencimento definida.",
        ].join("\n"),
        suggestions: ["receber fiado", "cobrar fiado"],
      };
    },
  },

  {
    id: "client.packages",
    category: "CLIENTES",
    risk: "READ",
    triggers: [
      /\b(pacotes?|creditos?|sessoes? (restantes|disponiveis))\b.*\b(cliente|da|do)\b/,
      /\bquanto (o|a) cliente tem de pacote\b/,
    ],
    keywords: ["pacotes", "creditos", "sessoes"],
    description: "Pacotes e créditos do cliente",
    examples: ["pacotes da Maria", "créditos do João"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);
      if (!match) {
        return { text: `Não encontrei esse ${ctx.labels.client}.`, suggestions: ["buscar cliente"] };
      }

      const packages = await ctx.actions.listClientPackages(ctx.actor.barbershopId, match.item.id);
      const active = packages.filter((pkg) => pkg.status === "ACTIVE");

      if (!active.length) {
        return {
          text: `${match.item.name} não tem pacotes ativos.`,
          suggestions: ["vender pacote", "ficha do cliente"],
        };
      }

      const lines = active.map(
        (pkg, index) =>
          `${index + 1}. ${pkg.packageName ?? "pacote"} — ${pkg.remainingSessions ?? 0} de ${
            pkg.totalSessions ?? 0
          } sessões restantes`
      );
      return {
        text: `Pacotes de ${match.item.name}:\n${lines.join("\n")}`,
        suggestions: ["ficha do cliente"],
      };
    },
  },

  {
    id: "client.create",
    category: "CLIENTES",
    risk: "WRITE",
    triggers: [
      /\b(cadastrar|cadastre|criar|novo)\b.*\b(cliente|paciente|aluno|tutor)\b/,
      /\bnovo cliente\b/,
    ],
    keywords: ["cadastrar", "cliente", "novo"],
    description: "Cadastrar um cliente novo",
    examples: ["cadastrar cliente Maria 11988887777"],
    async run(ctx, entities) {
      const name = entities.clientName ?? entities.subject;
      if (!name) {
        return {
          text: `Qual o nome do ${ctx.labels.client}?`,
          flow: { kind: "CLIENT_MESSAGE", step: "CLIENT_NAME" },
          suggestions: [],
        };
      }

      return {
        text: `Vou cadastrar ${name}. Qual o WhatsApp dele? (DDD + número)`,
        flow: { kind: "CLIENT_MESSAGE", step: "CLIENT_PHONE", clientName: name },
        suggestions: [],
      };
    },
  },

  {
    id: "client.update",
    category: "CLIENTES",
    risk: "WRITE",
    triggers: [
      /\b(mudar|alterar|atualizar|corrigir|trocar)\b.*\b(telefone|whatsapp|numero|nome)\b/,
      /\b(editar|corrigir)\b.*\b(cliente|contato)\b/,
    ],
    keywords: ["mudar", "telefone", "cliente"],
    description: "Atualizar telefone ou nome do cliente",
    examples: ["mudar o telefone da Maria"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);
      if (!match) {
        return {
          text: `Não encontrei esse ${ctx.labels.client}.`,
          suggestions: ["buscar cliente"],
        };
      }

      const phone = entities.phone;
      if (!phone) {
        return {
          text: `Qual o novo WhatsApp de ${match.item.name}? (DDD + número)`,
          flow: {
            kind: "CLIENT_MESSAGE",
            step: "CLIENT_PHONE",
            clientId: match.item.id,
            clientName: match.item.name,
          },
          suggestions: [],
        };
      }

      const summary = `Trocar o WhatsApp de ${match.item.name} (${maskPhone(
        match.item.whatsapp
      )}) para ${maskPhone(phone)}?`;
      if (!ctx.confirmed) {
        return { text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`, confirmation: { summary } };
      }

      await ctx.actions.updateClient(match.item.id, { whatsapp: phone }, ctx.actor);
      return {
        text: `WhatsApp de ${match.item.name} atualizado para ${maskPhone(phone)}.`,
        affectedIds: [match.item.id],
        suggestions: ["ficha do cliente"],
      };
    },
  },

  {
    id: "client.message",
    category: "CLIENTES",
    risk: "WRITE",
    triggers: [
      /\b(mandar|enviar|conversar|falar)\b.*\b(mensagem|msg)\b.*\b(cliente|paciente|aluno|tutor)\b/,
      /\b(estou a caminho|esta pronto|está pronto|pode vir)\b/,
      /\bavisar (o|a|ao|à)\b/,
    ],
    keywords: ["mensagem", "cliente", "avisar"],
    description: "Enviar mensagem a um cliente (instância do salão)",
    examples: ["avisar a Maria que estou a caminho", "manda mensagem para o João"],
    async run(ctx, entities) {
      const clients = await ctx.actions.listClients(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 8,
      });
      const match = findByName(clients, entities.clientName, (item) => item.name);

      if (!match) {
        return {
          text: `Não encontrei esse ${ctx.labels.client}. Quem é?\n${numberedList(
            clients.map((item) => ({ label: `${item.name} — ${maskPhone(item.whatsapp)}` }))
          )}`,
          list: {
            kind: "CLIENTS",
            items: clients.map((item) => ({ id: item.id, label: item.name })),
          },
          suggestions: [],
        };
      }

      if (!match.item.whatsapp) {
        return {
          text: `${match.item.name} não tem WhatsApp cadastrado.`,
          suggestions: ["atualizar telefone do cliente"],
        };
      }

      return {
        text: `Vou mandar para ${match.item.name} (${maskPhone(
          match.item.whatsapp
        )}) pelo WhatsApp do salão.\n\nO que você quer que eu envie?`,
        flow: {
          kind: "CLIENT_MESSAGE",
          step: "CLIENT_MESSAGE_TEXT",
          clientId: match.item.id,
          clientName: match.item.name,
        },
        suggestions: [],
      };
    },
  },
];

/** Nome do cliente extraído de frases como "da maria" (uso interno). */
export function clientNameFromText(text: string): string | undefined {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(?:da|do|do(a)?|para (a|o)|ao|à)\s+([a-z][a-z\s]{1,30})$/);
  if (!match) return undefined;
  const name = match[1].trim();
  return name.length >= 2 ? name : undefined;
}

export { suggestionsLine };
