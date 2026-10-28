import { formatBRL } from "./money";
import { findByName, numberedList, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de serviços, preços e pacotes.
 */
export const serviceCommands: OwnerBotCommand[] = [
  {
    id: "service.list",
    category: "SERVICOS",
    risk: "READ",
    triggers: [
      /\b(servicos?|atendimentos?|precios?|quanto custa)\b/,
      /\b(lista de precos|catalogo)\b/,
    ],
    keywords: ["servicos", "precos", "custa"],
    description: "Serviços e preços",
    examples: ["serviços e preços", "quanto custa o corte"],
    async run(ctx, entities) {
      const services = await ctx.actions.listServices(ctx.actor.barbershopId);
      const match = findByName(services, entities.serviceName, (item) => item.name);

      if (match && entities.serviceName) {
        return {
          text: `${match.item.name} — ${formatBRL(match.item.price)} (${match.item.avgTimeMinutes} min).`,
          suggestions: [`mudar preço do ${match.item.name}`, "pacotes"],
        };
      }

      if (!services.length) {
        return {
          text: "Nenhum serviço cadastrado ainda.",
          suggestions: ["criar serviço"],
        };
      }

      const lines = services
        .filter((service) => service.active !== false)
        .map(
          (service, index) =>
            `${index + 1}. ${service.name} — ${formatBRL(service.price)} (${
              service.avgTimeMinutes
            } min)`
        );

      return {
        text: `${ctx.labels.servicePlural[0].toUpperCase()}${ctx.labels.servicePlural.slice(1)}:\n${lines.join(
          "\n"
        )}`,
        list: {
          kind: "SERVICES",
          items: services.map((service) => ({ id: service.id, label: service.name })),
        },
        suggestions: ["pacotes", "mudar preço de um serviço"],
      };
    },
  },

  {
    id: "service.price",
    category: "SERVICOS",
    risk: "WRITE",
    triggers: [
      /\b(mudar|alterar|corrigir|ajustar|atualizar)\b.*\b(preco|preço|valor)\b/,
      /\bpreco (do|da)\b/,
    ],
    keywords: ["preco", "mudar", "valor"],
    description: "Alterar preço ou duração de um serviço",
    examples: ["mudar o preço do corte para 55", "deixar o corte 45 reais"],
    async run(ctx, entities) {
      const services = await ctx.actions.listServices(ctx.actor.barbershopId);
      const match = findByName(services, entities.serviceName, (item) => item.name);
      if (!match) {
        return {
          text: `Qual ${ctx.labels.service}?\n${numberedList(
            services.map((service) => ({ label: `${service.name} — ${formatBRL(service.price)}` }))
          )}`,
          list: {
            kind: "SERVICES",
            items: services.map((service) => ({ id: service.id, label: service.name })),
          },
          suggestions: [],
        };
      }

      const amount = entities.amount;
      if (!amount) {
        return {
          text: `Qual o novo valor do ${match.item.name}? (hoje é ${formatBRL(match.item.price)})`,
          flow: {
            kind: "COMMAND",
            step: "AMOUNT",
            commandId: "service.price",
            entities: { serviceId: match.item.id, serviceName: match.item.name },
          },
          suggestions: [],
        };
      }

      const summary = `Mudar o preço do ${match.item.name} de ${formatBRL(
        match.item.price
      )} para ${formatBRL(amount)}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.updateService(match.item.id, { price: amount }, ctx.actor);
      return {
        text: `Preço do ${match.item.name} agora é ${formatBRL(amount)}.`,
        affectedIds: [match.item.id],
        suggestions: ["serviços e preços", "faturamento do mês"],
      };
    },
  },

  {
    id: "service.toggle",
    category: "SERVICOS",
    risk: "WRITE",
    triggers: [
      /\b(desativar|desativa|ocultar|pausar)\b.*\b(servico|serviço)\b/,
      /\b(ativar|ativa)\b.*\b(servico|serviço)\b/,
    ],
    keywords: ["ativar", "desativar", "servico"],
    description: "Ativar ou desativar um serviço",
    examples: ["desativar o serviço coloração"],
    async run(ctx, entities) {
      const services = await ctx.actions.listServices(ctx.actor.barbershopId);
      const match = findByName(services, entities.serviceName, (item) => item.name);
      if (!match) {
        return {
          text: `Qual ${ctx.labels.service}?\n${numberedList(
            services.map((service) => ({ label: service.name }))
          )}`,
          list: {
            kind: "SERVICES",
            items: services.map((service) => ({ id: service.id, label: service.name })),
          },
          suggestions: [],
        };
      }

      const activate = /ativar|ativa|ligar/.test(entities.raw) && !/desativar|desativa/.test(entities.raw);
      const summary = `${activate ? "Ativar" : "Desativar"} o ${ctx.labels.service} ${match.item.name}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}?\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.updateService(match.item.id, { active: activate }, ctx.actor);
      return {
        text: `${match.item.name} ${activate ? "ativado" : "desativado"}.`,
        affectedIds: [match.item.id],
        suggestions: ["serviços e preços"],
      };
    },
  },

  {
    id: "service.create",
    category: "SERVICOS",
    risk: "WRITE",
    triggers: [
      /\b(criar|cadastrar|adicionar|novo)\b.*\b(servico|serviço|atendimento)\b/,
    ],
    keywords: ["criar", "servico", "novo"],
    description: "Criar um serviço novo",
    examples: ["criar serviço escova 55 40min"],
    async run(ctx, entities) {
      const amount = entities.amount;
      const name = entities.serviceName ?? entities.subject;
      if (!name || !amount) {
        return {
          text: `Para criar o ${ctx.labels.service}, me diga o nome e o preço. Ex.: "criar serviço escova 55".`,
          flow: { kind: "COMMAND", step: "AMOUNT", commandId: "service.create" },
          suggestions: [],
        };
      }

      const summary = `Criar ${ctx.labels.service} "${name}" por ${formatBRL(amount)}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      const created = await ctx.actions.createService(
        { name, price: amount },
        ctx.actor
      );
      return {
        text: `${created.name} criado — ${formatBRL(created.price)}.`,
        affectedIds: [created.id],
        suggestions: ["serviços e preços", "agendar"],
      };
    },
  },

  {
    id: "service.packages",
    category: "SERVICOS",
    risk: "READ",
    triggers: [
      /\b(pacotes?|combos?)\b/,
    ],
    keywords: ["pacotes", "combos"],
    description: "Pacotes e combos",
    examples: ["pacotes", "quais combos eu tenho"],
    async run(ctx) {
      const packages = await ctx.actions.listServicePackages(ctx.actor.barbershopId);
      if (!packages.length) {
        return {
          text: "Nenhum pacote cadastrado.",
          suggestions: ["criar serviço", "serviços e preços"],
        };
      }
      const lines = packages.map(
        (pkg, index) =>
          `${index + 1}. ${pkg.name} — ${pkg.sessionCount} sessões por ${formatBRL(pkg.price)}${
            pkg.active ? "" : " (inativo)"
          }`
      );
      return {
        text: `Pacotes:\n${lines.join("\n")}`,
        suggestions: ["vender pacote", "faturamento do mês"],
      };
    },
  },
];

export { suggestionsLine };
