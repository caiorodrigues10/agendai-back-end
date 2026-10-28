import { formatBRL } from "./money";
import { findByName, numberedList, periodOrDefault, suggestionsLine } from "./helpers";
import type { OwnerBotCommand } from "./types";

/**
 * Comandos de estoque e produtos.
 *
 * Só aparecem nos segmentos que usam produtos (ver `segmentProfiles`).
 */
export const inventoryCommands: OwnerBotCommand[] = [
  {
    id: "stock.list",
    category: "ESTOQUE",
    risk: "READ",
    triggers: [
      /\b(estoque|mercadoria)\b/,
      /\bquanto (tem|tenho) (de|do)\b/,
      /\b(lista|listar|ver|mostrar|consultar|quero)\b.*\b(produtos?|itens?)\b/,
      /\b(produtos?|itens?)\b.*\b(cadastrados|em estoque|disponiveis)\b/,
    ],
    keywords: ["estoque", "produtos", "quanto"],
    description: "Consultar estoque de um produto",
    examples: ["estoque", "quanto tenho de shampoo"],
    async run(ctx, entities) {
      const products = await ctx.actions.listProducts(ctx.actor.barbershopId);
      if (!products.length) {
        return {
          text: "Nenhum produto cadastrado.",
          suggestions: ["faturamento do mês"],
        };
      }

      const match = findByName(products, entities.subject ?? entities.serviceName, (item) => item.name);
      if (match) {
        const stock = match.item.stockQuantity ?? 0;
        const min = match.item.minimumStock;
        return {
          text: `${match.item.name}: ${stock} em estoque (${formatBRL(match.item.salePrice)} cada)${
            min !== null && min !== undefined && stock <= min ? " — estoque baixo!" : ""
          }`,
          suggestions: ["estoque baixo", "produtos mais vendidos"],
        };
      }

      const lines = products.slice(0, 10).map(
        (product, index) =>
          `${index + 1}. ${product.name} — ${product.stockQuantity ?? 0} un. (${formatBRL(
            product.salePrice
          )})`
      );
      return {
        text: `Estoque:\n${lines.join("\n")}`,
        list: {
          kind: "PRODUCTS",
          items: products.map((product) => ({ id: product.id, label: product.name })),
        },
        suggestions: ["estoque baixo", "produtos mais vendidos"],
      };
    },
  },

  {
    id: "stock.low",
    category: "ESTOQUE",
    risk: "READ",
    triggers: [
      /\b(estoque baixo|acabando|acabou|estoque acabando|produtos acabando)\b/,
      /\b(o que|que) esta (acabando|indo acabar)\b/,
    ],
    keywords: ["estoque", "baixo", "acabando"],
    description: "Itens acabando",
    examples: ["estoque baixo", "o que está acabando"],
    async run(ctx) {
      const alerts = await ctx.actions.stockAlerts(ctx.actor.barbershopId);
      if (!alerts.length) {
        return {
          text: "Nenhum item com estoque baixo. 👍",
          suggestions: ["estoque", "faturamento do mês"],
        };
      }
      const lines = alerts.slice(0, 10).map(
        (alert, index) =>
          `${index + 1}. ${alert.name} — ${alert.stockQuantity ?? 0} un. (mínimo ${
            alert.minimumStock ?? 0
          })`
      );
      return {
        text: `Itens para repor:\n${lines.join("\n")}`,
        suggestions: ["estoque", "faturamento do mês"],
      };
    },
  },

  {
    id: "stock.top",
    category: "ESTOQUE",
    risk: "READ",
    triggers: [
      /\b(mais vendidos|mais vendidos|produtos que mais vendem|top de produtos)\b/,
      /\bprodutos\b.*\b(venderam|vendidos)\b/,
    ],
    keywords: ["mais", "vendidos", "produtos"],
    description: "Produtos mais vendidos",
    examples: ["produtos mais vendidos"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "month");
      const reports = (await ctx.actions.productReports(
        ctx.actor.barbershopId,
        period.from,
        period.to
      )) as Record<string, unknown>;

      const top = (reports.topProducts ?? reports.top ?? []) as Array<{
        name?: string;
        productName?: string;
        quantity?: number;
        total?: number;
        revenue?: number;
      }>;

      if (!top.length) {
        return {
          text: `Não há vendas de produtos registradas em ${period.label}.`,
          suggestions: ["estoque", "faturamento do mês"],
        };
      }

      const lines = top.slice(0, 10).map((item, index) => {
        const name = item.name ?? item.productName ?? "produto";
        const quantity = item.quantity ?? 0;
        const revenue = item.revenue ?? item.total ?? 0;
        return `${index + 1}. ${name} — ${quantity} un. (${formatBRL(revenue)})`;
      });

      return {
        text: `Mais vendidos (${period.label}):\n${lines.join("\n")}`,
        suggestions: ["estoque baixo", "faturamento do mês"],
      };
    },
  },
];

export { suggestionsLine, numberedList };
