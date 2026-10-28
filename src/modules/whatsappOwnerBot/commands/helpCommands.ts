import { OWNER_BOT_CATEGORY_LABELS, OWNER_BOT_CATEGORY_ORDER } from "./catalog";
import { getOwnerBotSegmentProfile } from "../segmentProfiles";
import { commandApplies } from "./matcher";
import type { OwnerBotCommand, OwnerBotCommandCategory } from "./types";

/**
 * Menu e ajuda.
 *
 * A ajuda é sempre do segmento do dono: mostra o vocabulário dele
 * ("consultas de hoje", "ordens do dia") e os exemplos reais daquele tipo
 * de estabelecimento.
 */
export const helpCommands: OwnerBotCommand[] = [
  {
    id: "help.menu",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /^(menu|comandos|opcoes|opções)$/,
      /\b(ver |mostrar |listar )?(o menu|os comandos|todas as opcoes)\b/,
      /\bajuda (de|do|para)? ?(menu|comandos)\b/,
    ],
    keywords: ["menu", "comandos"],
    description: "Menu de categorias",
    examples: ["menu", "comandos"],
    async run(ctx) {
      const profile = getOwnerBotSegmentProfile(ctx.segment);
      const categories = OWNER_BOT_CATEGORY_ORDER.filter((category) =>
        profile.categories.includes(category)
      );

      const lines = categories.map(
        (category, index) => `${index + 1}. ${OWNER_BOT_CATEGORY_LABELS[category]}`
      );

      return {
        text: [
          `O que você quer fazer, ${ctx.link.ownerName.split(" ")[0]}?`,
          "",
          lines.join("\n"),
          "",
          "Responda com o número da categoria ou escreva o que precisa.",
          "Exemplos: \"faturamento do mês\", \"quem é a Maria?\", \"despesas\".",
        ].join("\n"),
        list: {
          kind: "COMMANDS",
          items: categories.map((category) => ({
            id: category,
            label: OWNER_BOT_CATEGORY_LABELS[category],
          })),
        },
        suggestions: ["agenda de hoje", "faturamento do mês"],
      };
    },
  },

  {
    id: "help.topic",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\bajuda (de|do|para|sobre)?\s*(agenda|clientes|financeiro|equipe|estoque|servicos|serviços|marketing|operacao|operação|conta)\b/,
      /\b(exemplos|como funciona)\b.*\b(agenda|financeiro|clientes|estoque)\b/,
    ],
    keywords: ["ajuda", "exemplos"],
    description: "Ajuda detalhada de um assunto",
    examples: ["ajuda financeiro", "exemplos de clientes"],
    async run(ctx) {
      const topic = matchTopic(ctx.raw);
      const commands = ctx.commands.filter(
        (command) =>
          command.category === topic &&
          commandApplies(command, ctx.segment) &&
          !command.id.startsWith("help.")
      );

      if (!commands.length) {
        return {
          text: `Não tenho comandos de "${OWNER_BOT_CATEGORY_LABELS[topic]}" para este tipo de estabelecimento.`,
          suggestions: ["menu", "ajuda"],
        };
      }

      const lines = commands.map((command) => `• ${command.description}: ${command.examples[0]}`);
      return {
        text: [
          `${OWNER_BOT_CATEGORY_LABELS[topic]} — exemplos:`,
          ...lines,
          "",
          "Pode escrever do seu jeito; eu entendo variações.",
        ].join("\n"),
        suggestions: ["menu"],
      };
    },
  },

  {
    id: "help.general",
    category: "CONTA",
    risk: "READ",
    triggers: [
      /\b(ajuda|help|como funciona|o que voce pode|o que você pode)\b/,
    ],
    keywords: ["ajuda", "comandos"],
    description: "Ajuda geral",
    examples: ["ajuda"],
    async run(ctx) {
      const profile = getOwnerBotSegmentProfile(ctx.segment);
      const highlights = profile.highlights;

      const lines = [
        `Sou o assistente do ${ctx.link.barbershopName}. Posso:`,
        "",
        ...highlights.map((highlight) => `• ${highlight}`),
        "",
        "Comandos por categoria: agenda, clientes, financeiro, equipe, serviços, marketing, operação e conta.",
        "Envie \"ajuda <categoria>\" para ver exemplos (ex.: \"ajuda financeiro\").",
      ];

      if (profile.complianceNote) lines.push("", profile.complianceNote);

      return {
        text: lines.join("\n"),
        suggestions: ["menu", "agenda de hoje", "faturamento do mês"],
      };
    },
  },
];

function matchTopic(raw: string): OwnerBotCommandCategory {
  const text = raw.toLowerCase();
  const entries = Object.entries(OWNER_BOT_CATEGORY_LABELS) as Array<
    [OwnerBotCommandCategory, string]
  >;
  for (const [category, label] of entries) {
    const key = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (text.includes(key)) return category;
  }
  if (/financeiro|caixa|dinheiro|lucro/.test(text)) return "FINANCEIRO";
  if (/cliente|paciente|aluno|tutor/.test(text)) return "CLIENTES";
  if (/agenda|horario/.test(text)) return "AGENDA";
  if (/equipe|profissional/.test(text)) return "EQUIPE";
  if (/estoque|produto/.test(text)) return "ESTOQUE";
  if (/servic|preco/.test(text)) return "SERVICOS";
  if (/marketing|avaliacao|rep put/.test(text)) return "MARKETING";
  if (/operacao|loja|fila/.test(text)) return "OPERACAO";
  return "AGENDA";
}
