import { maskPhone } from "../messages";
import { formatBRL, formatBRLShort, formatPercent } from "./money";
import { ownerBotToday } from "./periods";
import { findByName, numberedList, periodOrDefault, suggestionsLine } from "./helpers";
import type { OwnerBotCommand, OwnerBotEntities, OwnerBotPeriod } from "./types";

/**
 * Comandos financeiros.
 *
 * Todos os números vêm dos MESMOS use cases do app:
 * - `GetBarbershopInsightsUseCase` (faturamento, ticket, mejores serviços/dias);
 * - `ProfitUseCases` (lucro, margem, comparação mensal);
 * - `CashMovementUseCases` / `computeDay` (caixa do dia, entradas e saídas);
 * - `ListExpensesUseCase` (despesas), `ListFiadosUseCase` (fiado),
 *   `CommissionRepository` (comissões), `GoalUseCases` (metas).
 *
 * Nenhum valor é calculado "por conta própria": o bot só formata o que o
 * app já mostra.
 */
export const financialCommands: OwnerBotCommand[] = [
  {
    id: "fin.revenue",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(faturamento|faturei|faturou|quanto (fiz|ganhei|recebi|entrou)|total (de|do) (vendas|receita))\b/,
      /\bquanto (vendi|fiz no (dia|mes|mes))\b/,
      /\b(resumo|resumo financeiro)\b.*\b(hoje|mes|semana)\b/,
    ],
    keywords: ["faturamento", "quanto", "ganhei", "recebi"],
    description: "Faturamento, ticket e atendimentos do período",
    examples: ["faturamento de hoje", "quanto fiz este mês", "faturamento de outubro"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "day");
      const text = await revenueForPeriod(ctx, period, entities);
      return {
        text,
        suggestions: ["caixa de hoje", "despesas do mês", "lucro do mês"],
      };
    },
  },

  {
    id: "fin.ticket",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\bticket (medio|médio)\b/,
      /\bquanto (media|media) (cada|por)\b/,
      /\bvalor medio\b/,
    ],
    keywords: ["ticket", "medio", "valor"],
    description: "Ticket médio",
    examples: ["ticket médio", "quanto dá em média"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "month");
      if (period.kind === "month" && period.monthKey) {
        const profit = await ctx.actions.computePeriodProfit(ctx.actor.barbershopId, period.monthKey);
        const { totalRevenue, totalAppointments } = profit.summary;
        if (!totalAppointments) {
          return {
            text: `Não há ${ctx.labels.ticketUnit}s concluídos em ${period.label} para calcular o ticket médio.`,
            suggestions: ["faturamento do mês", "agenda do mês"],
          };
        }
        return {
          text: `Ticket médio de ${period.label}: ${formatBRL(totalRevenue / totalAppointments)} por ${
            totalAppointments
          } ${totalAppointments === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`}.`,
          suggestions: ["faturamento do mês", "melhores clientes"],
        };
      }

      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "30d");
      return {
        text: `Ticket médio (últimos 30 dias): ${formatBRL(insights.kpis.avgTicket)} por ${
          ctx.labels.ticketUnit
        }.`,
        suggestions: ["faturamento do mês", "melhor serviço"],
      };
    },
  },

  {
    id: "fin.cash",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(caixa|saldo|quanto (tem|ha) (no|de) caixa|entradas|saidas|saídas)\b/,
      /\b(dinheiro|pix|cartao|cartão)\b.*\b(do dia|hoje)\b/,
    ],
    keywords: ["caixa", "saldo", "entradas"],
    description: "Caixa do dia: entradas, saídas e formas de pagamento",
    examples: ["como está o caixa", "quanto tem no caixa hoje"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "day");
      const date = ownerBotToday(ctx.timezone, ctx.now);
      const [figures, summary] = await Promise.all([
        ctx.actions.dayFigures(ctx.actor.barbershopId, date),
        ctx.actions.cashSummary(ctx.actor.barbershopId, ctx.now),
      ]);

      const methods = Object.entries(summary.summary ?? {})
        .filter(([, value]) => value.count > 0)
        .map(([method, value]) => `${methodLabel(method)}: ${formatBRL(value.total)}`)
        .join("\n");

      const lines = [
        `Caixa de ${period.label}:`,
        `• Dinheiro: ${formatBRL(figures.cashReceived)}`,
        `• Pix: ${formatBRL(figures.pixReceived)}`,
        `• Cartão: ${formatBRL(figures.cardReceived)}`,
        `• Despesas: ${formatBRL(figures.expenses)}`,
        `• Fiado recebido: ${formatBRL(figures.fiadoPaid)}`,
        `• Venda de produtos: ${formatBRL(figures.productSales)}`,
      ];

      if (methods) lines.push("", "Por forma de pagamento:", methods);

      return {
        text: lines.join("\n"),
        suggestions: ["fechar o caixa do dia", "faturamento de hoje", "despesas de hoje"],
      };
    },
  },

  {
    id: "fin.closeout",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(fechamento|fechei|fechou)\b.*\b(caixa|dia)\b/,
      /\bstatus do (caixa|fechamento)\b/,
    ],
    keywords: ["fechamento", "caixa", "dia"],
    description: "Status do fechamento do caixa do dia",
    examples: ["fechei o caixa hoje?", "status do fechamento"],
    async run(ctx) {
      const closeout = await ctx.actions.closeout(ctx.actor.barbershopId, ctx.now);
      const closed = Boolean(closeout.closedAt);
      const discrepancy = Number(closeout.discrepancy ?? 0);

      const lines = [
        closed ? "Caixa de hoje já fechado." : "Caixa de hoje ainda não foi fechado.",
        `• Saldo inicial: ${formatBRL(Number(closeout.balanceOpen ?? 0))}`,
        `• Dinheiro: ${formatBRL(Number(closeout.cashReceived ?? 0))}`,
        `• Pix: ${formatBRL(Number(closeout.pixReceived ?? 0))}`,
        `• Cartão: ${formatBRL(Number(closeout.cardReceived ?? 0))}`,
        `• Despesas: ${formatBRL(Number(closeout.expenses ?? 0))}`,
        `• Comissões: ${formatBRL(Number(closeout.commissions ?? 0))}`,
        discrepancy !== 0 ? `• Diferença: ${formatBRL(discrepancy)}` : null,
      ].filter(Boolean) as string[];

      return {
        text: lines.join("\n"),
        suggestions: closed ? ["resumo de hoje"] : ["fechar o caixa do dia"],
      };
    },
  },

  {
    id: "fin.expenses",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(despesas|gastos|gastei|contas a pagar|contas do mes|despesa)\b/,
      /\b(onde|para que)\b.*\b(gastei|dinheiro)\b/,
    ],
    keywords: ["despesas", "gastos", "contas"],
    description: "Despesas do período por categoria",
    examples: ["despesas do mês", "quanto gastei"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "month");
      const [expenses, summary] = await Promise.all([
        ctx.actions.listExpenses(ctx.actor.barbershopId, {
          from: period.from,
          to: period.to,
          limit: 8,
        }),
        ctx.actions.expenseSummary(ctx.actor.barbershopId, period.from, period.to),
      ]);

      const total = Number(summary?.totalAmount ?? 0);
      const paid = Number(summary?.totalPaid ?? 0);
      const pending = Number(summary?.totalPending ?? 0);

      const byCategory = (summary?.byCategory ?? []).slice(0, 5);
      const categoryLines = byCategory.map(
        (category) => `• ${category.categoryName ?? "sem categoria"}: ${formatBRL(category.total)}`
      );

      const lines = [
        `Despesas de ${period.label}: ${formatBRL(total)}`,
        `• Pago: ${formatBRL(paid)}`,
        `• A pagar: ${formatBRL(pending)}`,
        categoryLines.length ? "\nPor categoria:" : "",
        ...categoryLines,
      ];

      if (expenses.length) {
        lines.push(
          "",
          "Maiores despesas:",
          ...expenses
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
            .map((expense) => `• ${expense.title} — ${formatBRL(expense.amount)}`)
        );
      }

      return {
        text: lines.filter(Boolean).join("\n"),
        suggestions: ["lançar despesa", "lucro do mês", "caixa de hoje"],
      };
    },
  },

  {
    id: "fin.profit",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(lucro|quanto sobrou|margem|profit|resultado)\b/,
      /\b(ganhei|sobrou)\b.*\b(dinheiro|mes)\b/,
    ],
    keywords: ["lucro", "sobrou", "margem"],
    description: "Lucro e margem do período",
    examples: ["lucro do mês", "quanto sobrou"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "month");
      if (period.kind === "month" && period.monthKey) {
        const profit = await ctx.actions.computePeriodProfit(ctx.actor.barbershopId, period.monthKey);
        const summary = profit.summary;
        const lines = [
          `Lucro de ${period.label}:`,
          `• Faturamento: ${formatBRL(summary.totalRevenue)}`,
          `• Despesas: ${formatBRL(summary.totalExpenses)}`,
          `• Comissões: ${formatBRL(summary.totalCommission)}`,
          `• Impostos: ${formatBRL(summary.totalTax)}`,
          `• Lucro líquido: ${formatBRL(summary.netProfit)}`,
          `• Margem: ${formatPercent(summary.marginPercent)}`,
        ];
        return {
          text: lines.join("\n"),
          suggestions: ["faturamento do mês", "comparar com o mês passado"],
        };
      }

      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "30d");
      return {
        text: [
          "Lucro (últimos 30 dias):",
          `• Faturamento: ${formatBRL(insights.kpis.revenue)}`,
          `• Despesas: ${formatBRL(insights.kpis.expenses)}`,
          `• Lucro: ${formatBRL(insights.kpis.netProfit)}`,
        ].join("\n"),
        suggestions: ["faturamento do mês", "comparar com o mês passado"],
      };
    },
  },

  {
    id: "fin.commissions",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(comissoes?|comissao)\b/,
      /\bquanto (o|a) \w+ (tem a receber|ganhou)\b/,
      /\b(profissional|colaborador)\b.*\b(comissao|receber)\b/,
    ],
    keywords: ["comissao", "comissoes", "receber"],
    description: "Comissões a receber",
    examples: ["comissões do mês", "quanto a Ana tem a receber"],
    async run(ctx, entities) {
      const period = periodOrDefault(entities, ctx, "month");
      const from = period.from.toISOString().slice(0, 10);
      const to = period.to.toISOString().slice(0, 10);

      let professionalId: string | undefined;
      let professionalName: string | undefined;
      if (entities.staffName) {
        const staff = await ctx.actions.listStaff(ctx.actor.barbershopId);
        const match = findByName(staff, entities.staffName, (item) => item.name);
        if (match) {
          professionalId = match.item.id;
          professionalName = match.item.name;
        }
      }

      const summary = await ctx.actions.commissionSummary(ctx.actor.barbershopId, {
        from,
        to,
        professionalId,
      });

      if (!summary.byProfessional.length) {
        return {
          text: `Não há comissões registradas em ${period.label}.`,
          suggestions: ["faturamento do mês", "equipe hoje"],
        };
      }

      const lines = summary.byProfessional
        .sort((a, b) => b.commissionTotal - a.commissionTotal)
        .map(
          (item, index) =>
            `${index + 1}. ${item.professionalName} — ${formatBRL(item.commissionTotal)} (${
              item.entryCount
            } ${item.entryCount === 1 ? "atendimento" : "atendimentos"})`
        );

      const total = professionalName
        ? `Comissão de ${professionalName} em ${period.label}`
        : `Comissões de ${period.label}`;

      return {
        text: `${total}:\n${lines.join("\n")}\n\nTotal: ${formatBRL(summary.commissionTotal)}`,
        suggestions: ["ranking do mês", "equipe hoje"],
      };
    },
  },

  {
    id: "fin.fiado",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(fiados?|fiado)\b/,
      /\bquem (deve|esta devendo|tem (algo )?a pagar)\b/,
      /\b(dividas?|devedores)\b/,
    ],
    keywords: ["fiado", "deve", "divida"],
    description: "Fiado em aberto e vencido",
    examples: ["quanto tenho de fiado", "quem está devendo"],
    async run(ctx) {
      const [fiados, summary] = await Promise.all([
        ctx.actions.listFiados(ctx.actor.barbershopId, { limit: 50 }),
        ctx.actions.fiadoSummary(ctx.actor.barbershopId),
      ]);
      const open = fiados.filter((item) => item.status === "PENDING" || item.status === "PARTIAL");

      if (!open.length) {
        return {
          text: "Nenhum fiado em aberto. 🎉",
          suggestions: ["faturamento do mês", "caixa de hoje"],
        };
      }

      const lines = open
        .sort((a, b) => b.remainingAmount - a.remainingAmount)
        .slice(0, 10)
        .map(
          (item, index) =>
            `${index + 1}. ${item.customerName} — ${formatBRL(item.remainingAmount)}${
              item.isOverdue ? " (vencido)" : ""
            }${item.whatsapp ? ` — ${maskPhone(item.whatsapp)}` : ""}`
        );

      const overdue = Number(summary?.overdueAmount ?? 0);
      return {
        text: [
          `Fiados em aberto: ${formatBRL(Number(summary?.totalPending ?? 0))}`,
          overdue > 0 ? `Vencidos: ${formatBRL(overdue)}` : null,
          "",
          lines.join("\n"),
        ]
          .filter(Boolean)
          .join("\n"),
        suggestions: ["receber fiado", "cobrar fiado", "clientes sumidos"],
      };
    },
  },

  {
    id: "fin.goals",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(meta|metas|objetivo|objetivos)\b/,
      /\b(quanto falta|progresso)\b/,
    ],
    keywords: ["meta", "metas", "progresso"],
    description: "Metas do salão e progresso",
    examples: ["como está minha meta", "progresso da meta do mês"],
    async run(ctx) {
      const goals = await ctx.actions.goals(ctx.actor.barbershopId);
      if (!goals.length) {
        return {
          text: "Nenhuma meta cadastrada por aqui. Quer cadastrar uma?",
          suggestions: ["ajuda", "faturamento do mês"],
        };
      }

      const lines = goals.map((goal, index) => {
        const progress = goal.progressPercent ?? goal.currentValue;
        const target = goal.target;
        const falta =
          typeof progress === "number" && typeof target === "number"
            ? ` — faltam ${formatBRL(Math.max(0, target - progress))}`
            : "";
        return `${index + 1}. ${goal.metric} (${goal.period}): ${progress ?? 0}/${target}${falta}`;
      });

      return {
        text: `Suas metas:\n${lines.join("\n")}`,
        suggestions: ["faturamento do mês", "lucro do mês"],
      };
    },
  },

  {
    id: "fin.compare",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(comparar|comparacao|comparação|vs|contra)\b/,
      /\b(em relacao|comparado)\b.*\b(mes|mes anterior|semana)\b/,
      /\bcomo foi (esse mes|esse) (comparado|em relacao)\b/,
    ],
    keywords: ["comparar", "comparacao", "mes"],
    description: "Comparativo com o período anterior",
    examples: ["como foi esse mês comparado ao anterior", "faturamento vs mês passado"],
    async run(ctx) {
      const trend = await ctx.actions.profitTrend(ctx.actor.barbershopId, 6);
      if (trend.length < 2) {
        return {
          text: "Ainda não tenho meses fechados suficientes para comparar.",
          suggestions: ["faturamento do mês", "lucro do mês"],
        };
      }

      const current = trend[trend.length - 1];
      const previous = trend[trend.length - 2];
      const diff = current.revenue - previous.revenue;
      const diffPercent = previous.revenue > 0 ? (diff / previous.revenue) * 100 : 0;

      const lines = [
        `Faturamento ${current.period}: ${formatBRL(current.revenue)}`,
        `Faturamento ${previous.period}: ${formatBRL(previous.revenue)}`,
        `Diferença: ${diff >= 0 ? "+" : ""}${formatBRL(diff)} (${formatPercent(diffPercent)})`,
        `Lucro ${current.period}: ${formatBRL(current.netProfit)} (margem ${formatPercent(
          current.marginPercent
        )})`,
        `Lucro ${previous.period}: ${formatBRL(previous.netProfit)} (margem ${formatPercent(
          previous.marginPercent
        )})`,
      ];

      return {
        text: lines.join("\n"),
        suggestions: ["lucro do mês", "melhor serviço"],
      };
    },
  },

  {
    id: "fin.best",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(melhor (dia|servico|serviço|horario|horário)|servico que mais rende|horario mais cheio|qual servico mais vende)\b/,
      /\b(o que|qual) (mais rende|mais vende|mais lucra)\b/,
    ],
    keywords: ["melhor", "servico", "dia", "horario"],
    description: "Melhor dia, serviço e horário",
    examples: ["qual serviço mais rende", "melhor dia da semana"],
    async run(ctx) {
      const insights = await ctx.actions.insights(ctx.actor.barbershopId, "90d");
      const topService = insights.topServices[0];
      const topStaff = insights.byStaff[0];
      const bestDay = [...insights.byWeekday].sort((a, b) => b.revenue - a.revenue)[0];
      const bestHour = [...insights.byHour].sort((a, b) => b.volume - a.volume)[0];

      const lines = [
        "Últimos 90 dias:",
        topService
          ? `• ${ctx.labels.service[0].toUpperCase()}${ctx.labels.service.slice(1)} que mais rende: ${
              topService.name
            } — ${formatBRL(topService.revenue)} em ${topService.count} ${
              topService.count === 1 ? ctx.labels.ticketUnit : `${ctx.labels.ticketUnit}s`
            }`
          : null,
        topStaff ? `• Melhor ${ctx.labels.professional}: ${topStaff.name} — ${formatBRL(topStaff.revenue)}` : null,
        bestDay ? `• Melhor dia: ${bestDay.label} — ${formatBRL(bestDay.revenue)}` : null,
        bestHour ? `• Horário mais cheio: ${bestHour.label} (${bestHour.volume})` : null,
      ].filter(Boolean) as string[];

      if (lines.length === 1) {
        return {
          text: "Ainda não tenho histórico suficiente para comparar dias e serviços.",
          suggestions: ["faturamento do mês", "clientes sumidos"],
        };
      }

      return {
        text: lines.join("\n"),
        suggestions: ["faturamento do mês", "ticket médio"],
      };
    },
  },

  {
    id: "fin.packages",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(pacotes (vendidos|ativos)|venda de pacotes|pacotes do mes)\b/,
      /\bquantos pacotes\b/,
    ],
    keywords: ["pacotes", "vendidos"],
    description: "Pacotes vendidos",
    examples: ["pacotes vendidos no mês"],
    async run(ctx) {
      const packages = await ctx.actions.listClientPackages(ctx.actor.barbershopId);
      if (!packages.length) {
        return {
          text: "Nenhum pacote vendido por aqui ainda.",
          suggestions: ["faturamento do mês", "vender pacote"],
        };
      }
      const total = packages.reduce((sum, pkg) => sum + Number(pkg.totalSessions ?? 0), 0);
      const remaining = packages.reduce((sum, pkg) => sum + Number(pkg.remainingSessions ?? 0), 0);
      const active = packages.filter((pkg) => pkg.status === "ACTIVE");

      return {
        text: [
          `Pacotes: ${packages.length} (${active.length} ativos)`,
          `• Sessões contratadas: ${total}`,
          `• Sessões restantes: ${remaining}`,
        ].join("\n"),
        suggestions: ["faturamento do mês", "clientes sumidos"],
      };
    },
  },

  {
    id: "fin.vouchers",
    category: "FINANCEIRO",
    risk: "READ",
    triggers: [
      /\b(vouchers?|cupons?|cupom)\b/,
    ],
    keywords: ["voucher", "cupom"],
    description: "Vouchers e cupons",
    examples: ["quais vouchers tenho"],
    async run(ctx) {
      const vouchers = await ctx.actions.listVouchers(ctx.actor.barbershopId);
      if (!vouchers.length) {
        return {
          text: "Nenhum voucher cadastrado.",
          suggestions: ["faturamento do mês"],
        };
      }
      const active = vouchers.filter((voucher) => voucher.active);
      const lines = vouchers
        .slice(0, 10)
        .map(
          (voucher, index) =>
            `${index + 1}. ${voucher.code} — ${voucher.active ? "ativo" : "inativo"}${
              voucher.discountValue ? ` (${formatBRL(voucher.discountValue)})` : ""
            }`
        );
      return {
        text: `Vouchers (${active.length} ativos de ${vouchers.length}):\n${lines.join("\n")}`,
        suggestions: ["faturamento do mês"],
      };
    },
  },

  // ─── Escritas ──────────────────────────────────────────────────────────────

  {
    id: "fin.expense.create",
    category: "FINANCEIRO",
    risk: "WRITE",
    triggers: [
      /\b(lancar|lance|registrar|anotar)\b.*\b(despesa|gasto|conta)\b/,
      /\b(gastei|paguei|gasto de|comprei)\b/,
      /\bdespesa de\b/,
    ],
    keywords: ["gastei", "despesa", "lancar", "paguei"],
    description: "Lançar uma despesa",
    examples: ["gastei 80 de produto", "lançar despesa de 120 com a distribuidora"],
    async run(ctx, entities) {
      const amount = entities.amount;
      if (!amount) {
        return {
          text: "Quanto foi a despesa? (ex.: 80 ou R$ 1.200,50)",
          flow: { kind: "COMMAND", step: "AMOUNT", commandId: "fin.expense.create" },
          suggestions: [],
        };
      }

      const title = expenseTitle(entities);
      const summary = `Lançar despesa de ${formatBRL(amount)} — ${title}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      const expense = await ctx.actions.createExpense(
        {
          title,
          amount,
          referenceDate: ctx.now,
          paidAt: ctx.now,
          type: "VARIABLE",
        },
        ctx.actor
      );

      return {
        text: `Despesa lançada: ${expense.title} — ${formatBRL(expense.amount)}.`,
        affectedIds: [expense.id],
        suggestions: ["despesas do mês", "lucro do mês", "caixa de hoje"],
      };
    },
  },

  {
    id: "fin.cash.movement",
    category: "FINANCEIRO",
    risk: "WRITE",
    triggers: [
      /\b(lancar|lance|registrar)\b.*\b(entrada|saida|saída)\b.*\b(caixa|no caixa)\b/,
      /\b(entrada|saida) de (dinheiro|caixa)\b/,
    ],
    keywords: ["entrada", "saida", "caixa"],
    description: "Lançar entrada ou saída no caixa",
    examples: ["lançar entrada de 200 no caixa"],
    async run(ctx, entities) {
      const amount = entities.amount;
      if (!amount) {
        return {
          text: "Qual valor? (ex.: 200 ou R$ 1.200,50)",
          flow: { kind: "COMMAND", step: "AMOUNT", commandId: "fin.cash.movement" },
          suggestions: [],
        };
      }

      const isExpense = /saida|saída|gasto|pagamento/.test(entities.raw);
      const type = isExpense ? "EXPENSE" : "OTHER_INCOME";
      const description = isExpense ? "Saída de caixa (lançamento manual)" : "Entrada de caixa (lançamento manual)";
      const summary = `${isExpense ? "Registrar saída" : "Registrar entrada"} de ${formatBRL(amount)} no caixa`;

      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.registerCashMovement(ctx.actor.barbershopId, ctx.actor.userId, {
        type,
        amount,
        paymentMethod: "cash",
        description,
        occurredAt: ctx.now,
      });

      return {
        text: `${summary} — registrado.`,
        suggestions: ["caixa de hoje", "despesas do mês"],
      };
    },
  },

  {
    id: "fin.fiado.payment",
    category: "FINANCEIRO",
    risk: "WRITE",
    triggers: [
      /\b(recebi|receber|pagou|pagamento)\b.*\b(fiado|divida|dívida)\b/,
      /\b(registrar|baixar)\b.*\bpagamento\b/,
    ],
    keywords: ["receber", "fiado", "pagamento"],
    description: "Registrar pagamento de fiado",
    examples: ["a Maria pagou 50 do fiado"],
    async run(ctx, entities) {
      const fiados = await ctx.actions.listFiados(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(fiados, entities.clientName, (item) => item.customerName);
      if (!match) {
        return {
          text: `Não encontrei o fiado de ${entities.clientName ?? "esse cliente"}. Quem é?\n${numberedList(
            fiados.map((item) => ({ label: `${item.customerName} — ${formatBRL(item.remainingAmount)}` }))
          )}`,
          list: {
            kind: "FIADOS",
            items: fiados.map((item) => ({ id: item.id, label: item.customerName })),
          },
          suggestions: [],
        };
      }

      const amount = entities.amount ?? match.item.remainingAmount;
      const summary = `Registrar pagamento de ${formatBRL(amount)} do fiado de ${match.item.customerName}`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.addFiadoPayment(
        { fiadoId: match.item.id, amount, paymentMethod: "pix" },
        ctx.actor
      );

      return {
        text: `Pagamento de ${formatBRL(amount)} registrado. ${match.item.customerName} ainda deve ${formatBRL(
          Math.max(0, match.item.remainingAmount - amount)
        )}.`,
        affectedIds: [match.item.id],
        suggestions: ["fiados em aberto", "caixa de hoje"],
      };
    },
  },

  {
    id: "fin.fiado.charge",
    category: "FINANCEIRO",
    risk: "WRITE",
    triggers: [
      /\b(cobrar|cobranca|cobrança)\b.*\b(fiado|cliente|dividas?)\b/,
      /\bmandar (a )?cobranca\b/,
    ],
    keywords: ["cobrar", "fiado", "cobranca"],
    description: "Cobrar fiado do cliente",
    examples: ["cobrar o fiado da Maria"],
    async run(ctx, entities) {
      const fiados = await ctx.actions.listFiados(ctx.actor.barbershopId, {
        search: entities.clientName,
        limit: 10,
      });
      const match = findByName(fiados, entities.clientName, (item) => item.customerName);
      if (!match) {
        return {
          text: `Não encontrei o fiado de ${entities.clientName ?? "esse cliente"}.`,
          suggestions: ["fiados em aberto"],
        };
      }

      const summary = `Enviar cobrança de ${formatBRL(match.item.remainingAmount)} para ${
        match.item.customerName
      } (${maskPhone(match.item.whatsapp)})`;
      if (!ctx.confirmed) {
        return {
          text: `${summary}\n\nConfirma? Responda 1-Sim ou 2-Não.`,
          confirmation: { summary },
        };
      }

      await ctx.actions.chargeFiado(match.item.id, {}, ctx.actor);

      return {
        text: `Cobrança enviada para ${match.item.customerName} pelo WhatsApp do salão.`,
        affectedIds: [match.item.id],
        suggestions: ["fiados em aberto", "caixa de hoje"],
      };
    },
  },

  {
    id: "fin.cash.close",
    category: "FINANCEIRO",
    risk: "SENSITIVE",
    triggers: [
      /\b(fechar (o )?caixa|fechamento (do )?caixa|encerrar (o )?caixa)\b/,
    ],
    keywords: ["fechar", "caixa", "fechamento"],
    description: "Fechar o caixa do dia",
    examples: ["fechar o caixa de hoje"],
    async run(ctx) {
      const figures = await ctx.actions.dayFigures(
        ctx.actor.barbershopId,
        ownerBotToday(ctx.timezone, ctx.now)
      );
      const summary = `Fechar o caixa de hoje (dinheiro ${formatBRL(
        figures.cashReceived
      )}, pix ${formatBRL(figures.pixReceived)}, cartão ${formatBRL(figures.cardReceived)})`;

      if (!ctx.confirmed) {
        return {
          text:
            `${summary}\n\n⚠️ Fechar o caixa não pode ser desfeito.\n` +
            "Para confirmar, digite CONFIRMAR.",
          confirmation: { summary, strong: true },
        };
      }

      const result = await ctx.actions.closeCashDay(
        ctx.actor.barbershopId,
        ctx.now,
        ctx.actor.userId,
        {
          cashReceived: figures.cashReceived,
          pixReceived: figures.pixReceived,
          cardReceived: figures.cardReceived,
          balanceOpen: 0,
        }
      );

      const discrepancy = Number((result as { cashDiscrepancy?: number }).cashDiscrepancy ?? 0);
      return {
        text: [
          "Caixa de hoje fechado.",
          `• Diferença: ${formatBRL(discrepancy)}`,
          "• Sem desfazer: fechamento de caixa é definitivo.",
        ].join("\n"),
        suggestions: ["resumo de hoje", "faturamento de hoje"],
      };
    },
  },
];

/** Revenue by period — same source as the app screens. */
async function revenueForPeriod(
  ctx: Parameters<OwnerBotCommand["run"]>[0],
  period: OwnerBotPeriod,
  entities: OwnerBotEntities
): Promise<string> {
  if (period.kind === "month" && period.monthKey) {
    const profit = await ctx.actions.computePeriodProfit(ctx.actor.barbershopId, period.monthKey);
    const summary = profit.summary;
    const ticket = summary.totalAppointments
      ? summary.totalRevenue / summary.totalAppointments
      : 0;
    return [
      `Faturamento de ${period.label}: ${formatBRL(summary.totalRevenue)}`,
      `• ${ctx.labels.servicePlural[0].toUpperCase()}${ctx.labels.servicePlural.slice(1)}: ${formatBRL(
        summary.serviceRevenue
      )}`,
      `• Produtos: ${formatBRL(summary.productRevenue)}`,
      `• Atendimentos concluídos: ${summary.totalAppointments}`,
      `• Ticket médio: ${formatBRL(ticket)}`,
    ].join("\n");
  }

  if (period.kind === "day") {
    const date = ownerBotToday(ctx.timezone, ctx.now);
    const [figures, appointments] = await Promise.all([
      ctx.actions.dayFigures(ctx.actor.barbershopId, date),
      ctx.actions.listAppointments(ctx.actor.barbershopId, date),
    ]);
    const completed = appointments.filter((item) => item.status === "COMPLETED");
    const ticket = completed.length
      ? completed.reduce((sum, item) => sum + Number(item.servicePrice ?? 0), 0) / completed.length
      : 0;

    return [
      `Faturamento de ${period.label}:`,
      `• Dinheiro: ${formatBRL(figures.cashReceived)}`,
      `• Pix: ${formatBRL(figures.pixReceived)}`,
      `• Cartão: ${formatBRL(figures.cardReceived)}`,
      `• Produtos: ${formatBRL(figures.productSales)}`,
      `• Atendimentos concluídos: ${completed.length}`,
      completed.length ? `• Ticket médio: ${formatBRL(ticket)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const preset = period.kind === "week" ? "7d" : "90d";
  const insights = await ctx.actions.insights(ctx.actor.barbershopId, preset);
  return [
    `Faturamento (${period.label}): ${formatBRL(insights.kpis.revenue)}`,
    `• Atendimentos concluídos: ${insights.kpis.completedServices}`,
    `• Ticket médio: ${formatBRL(insights.kpis.avgTicket)}`,
    `• Clientes diferentes: ${insights.kpis.uniqueCustomers}`,
  ].join("\n");
}

/** Título da despesa a partir do que o dono escreveu. */
function expenseTitle(entities: OwnerBotEntities): string {
  const raw = entities.raw
    .replace(/r\$?\s*\d+(?:[.,]\d+)?/gi, "")
    .replace(/\b(gastei|paguei|lancar|lance|registrar|anotar|despesa|de|do|da|em|com|para)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length >= 3 ? raw.slice(0, 80) : "Despesa";
}

function methodLabel(method: string): string {
  switch (method) {
    case "CASH":
      return "Dinheiro";
    case "PIX":
      return "Pix";
    case "CREDIT_CARD":
      return "Cartão de crédito";
    case "DEBIT_CARD":
      return "Cartão de débito";
    case "FIADO":
      return "Fiado";
    default:
      return method;
  }
}

export { suggestionsLine, formatBRLShort };
