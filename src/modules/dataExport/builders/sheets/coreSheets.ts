/**
 * Abas núcleo: "Leia-me", "Resumo" e "Configurações do negócio".
 *
 * A aba "Resumo" é a paridade com os relatórios do app: os números saem do
 * mesmo motor de lucro (ver `summaryData.ts`).
 */
import { prisma } from "@/libs/prismaClient";
import {
  addBlankRow,
  addReportRow,
  addRow,
  addSectionRow,
  formatCell,
  setupSheet,
  WEEKDAY_LABELS,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { computePeriodSummary } from "../summaryData";
import { safeText } from "../../utils/cellSafety";

const REPORT_COLUMNS: ColumnSpec[] = [
  { header: "Indicador", type: "text", width: 52 },
  { header: "Valor", type: "text", width: 26 },
];

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDateTimeBR(date: Date): string {
  return date.toLocaleString("pt-BR", { timeZone: "UTC" });
}

/** ── Leia-me ──────────────────────────────────────────────────────────────── */

export const leiaMeSheet: SheetBuilder = {
  key: "readme",
  name: "Leia-me",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, REPORT_COLUMNS);

    addSectionRow(sheet, "Planilha de dados do Agendaí");
    addReportRow(sheet, "Estabelecimento", ctx.shop.name);
    addReportRow(sheet, "Gerada em", formatDateTimeBR(ctx.generatedAt));
    addReportRow(sheet, "Período", ctx.period.label);
    addReportRow(sheet, "Fuso horário", ctx.period.timezone);
    addReportRow(
      sheet,
      "Anonimização de dados pessoais",
      ctx.options.anonymize ? "Sim (nomes, telefones e e-mails mascarados)" : "Não",
    );

    addBlankRow(sheet);
    addSectionRow(sheet, "O que tem em cada aba");
    for (const item of ctx.includedSheets) {
      addReportRow(sheet, item.name, item.description);
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Como os períodos foram calculados");
    addReportRow(sheet, "Hoje", "O dia inteiro no fuso do estabelecimento.");
    addReportRow(sheet, "Esta semana", "De domingo a sábado (mesma definição dos relatórios do app).");
    addReportRow(sheet, "Este mês", "Do dia 1 até hoje.");
    addReportRow(sheet, "Últimos 3/6/12 meses", "Janela móvel terminando hoje, começando no mesmo dia do mês anterior.");
    addReportRow(sheet, "Personalizado", "Datas de calendário no fuso do estabelecimento (máximo de 24 meses por emissão).");
    addReportRow(sheet, "Tudo", "Sem filtro de data (backup completo).");

    addBlankRow(sheet);
    addSectionRow(sheet, "Limitações");
    addReportRow(
      sheet,
      "Teto por aba",
      "Cada aba pode ter no máximo 200.000 linhas. Se o período for muito amplo, reduza o intervalo.",
    );
    addReportRow(sheet, "Valores", "Todos os valores são numéricos e estão em real (R$). Datas são datas reais do Excel.");
    addReportRow(sheet, "Horas", "Horas aparecem como texto HH:MM (o app guarda a hora do atendimento, não um instante).");
    addReportRow(sheet, "Arquivos", "O link de download expira em 24 horas. Guarde o arquivo onde você precisar.");

    addBlankRow(sheet);
    addSectionRow(sheet, "Aviso de dados pessoais (LGPD)");
    addReportRow(
      sheet,
      "Contém dados pessoais",
      "Esta planilha contém dados pessoais de clientes. Proteja o arquivo conforme a LGPD: acesso restrito, senha e descarte seguro.",
    );
    addReportRow(
      sheet,
      "Anonimizar",
      "Ao marcar “Anonimizar dados pessoais” na emissão, nome, telefone e e-mail de clientes saem mascarados — ideal para compartilhar com contador.",
    );

    addBlankRow(sheet);
    addSectionRow(sheet, "Como reimportar esta planilha");
    addReportRow(
      sheet,
      "Abas reimportáveis",
      "As abas Clientes, Serviços e Agendamentos usam exatamente os cabeçalhos aceitos pelo assistente de importação (Configurações → Importar dados).",
    );
    addReportRow(
      sheet,
      "Passo a passo",
      "Baixe a planilha, abra o assistente de importação, escolha o tipo CLIENTS para a aba Clientes, SERVICES para Serviços e APPOINTMENTS para Agendamentos — o mapeamento é automático.",
    );
    addReportRow(
      sheet,
      "Atenção",
      "Reimportar atualiza o que já existe (o telefone identifica o cliente, o nome identifica o serviço) e não duplica. Dados de clientes e serviços não dependem do período.",
    );

    if (ctx.options.includeCase) {
      addBlankRow(sheet);
      addSectionRow(sheet, "Sigilo profissional");
      addReportRow(
        sheet,
        "Dados de casos incluídos",
        "Esta exportação inclui dados de processos por opção explícita. São informações sob sigilo profissional: trate com a mesma cuidado do processo original.",
      );
    }

    if (ctx.warnings.length > 0) {
      addBlankRow(sheet);
      addSectionRow(sheet, "Avisos desta emissão");
      for (const warning of ctx.warnings) {
        addReportRow(sheet, "Aviso", warning);
      }
    }
  },
};

/** ── Resumo ───────────────────────────────────────────────────────────────── */

export const resumoSheet: SheetBuilder = {
  key: "summary",
  name: "Resumo",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, REPORT_COLUMNS);

    const current = await computePeriodSummary(ctx.shop.id, {
      from: ctx.period.from,
      to: ctx.period.to,
    });
    const previous = ctx.previousPeriod
      ? await computePeriodSummary(ctx.shop.id, {
          from: ctx.previousPeriod.from,
          to: ctx.previousPeriod.to,
        })
      : null;

    addSectionRow(sheet, "Identificação");
    addReportRow(sheet, "Estabelecimento", ctx.shop.name);
    addReportRow(sheet, "Segmento", ctx.shop.businessSegment ?? "Não informado");
    addReportRow(sheet, "Cidade", ctx.shop.city ?? "Não informada");
    addReportRow(sheet, "WhatsApp", ctx.shop.whatsapp ?? "Não informado");
    if (ctx.shop.oabRegistration) {
      addReportRow(sheet, "Registro profissional (OAB)", ctx.shop.oabRegistration);
    }
    addReportRow(sheet, "Período", ctx.period.label);
    addReportRow(sheet, "Fuso horário", ctx.period.timezone);
    addReportRow(sheet, "Gerada em", formatDateTimeBR(ctx.generatedAt));

    addBlankRow(sheet);
    addSectionRow(sheet, "Indicadores do período");
    addReportRow(sheet, "Faturamento", current.revenue, "currency");
    addReportRow(sheet, "Receita de serviços", current.serviceRevenue, "currency");
    addReportRow(sheet, "Receita de produtos (PDV)", current.productRevenue, "currency");
    addReportRow(sheet, "Despesas", current.expenses, "currency");
    addReportRow(sheet, "Comissões", current.commissions, "currency");
    addReportRow(sheet, "Impostos estimados", current.taxAmount, "currency");
    addReportRow(sheet, "Lucro líquido", current.netProfit, "currency");
    addReportRow(sheet, "Margem líquida", current.marginPercent, "decimal");
    addReportRow(sheet, "Atendimentos concluídos", current.completedCount, "int");
    addReportRow(sheet, "Atendimentos cancelados", current.canceledCount, "int");
    addReportRow(sheet, "Faltas", current.noShowCount, "int");
    addReportRow(sheet, "Agendamentos em aberto", current.scheduledCount, "int");
    addReportRow(sheet, "Total de atendimentos (concluídos + fila)", current.totalAppointments, "int");
    addReportRow(sheet, "Ticket médio", current.ticketAverage, "currency");
    addReportRow(sheet, "Novos clientes", current.newClients, "int");
    addReportRow(sheet, "Clientes ativos no período", current.activeClients, "int");

    addBlankRow(sheet);
    addSectionRow(sheet, "Por forma de pagamento");
    if (current.byPaymentMethod.length === 0) {
      addReportRow(sheet, "Sem dados no período", "");
    } else {
      for (const item of current.byPaymentMethod) {
        addReportRow(sheet, `${item.method} (${item.count} atendimentos)`, item.total, "currency");
      }
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Por profissional");
    if (current.byStaff.length === 0) {
      addReportRow(sheet, "Sem dados no período", "");
    } else {
      for (const item of current.byStaff) {
        addReportRow(
          sheet,
          `${item.name} (${item.count} atendimentos)`,
          item.revenue,
          "currency",
        );
        addReportRow(sheet, `  Comissão de ${item.name}`, item.commission, "currency");
      }
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Por serviço");
    if (current.byService.length === 0) {
      addReportRow(sheet, "Sem dados no período", "");
    } else {
      for (const item of current.byService) {
        addReportRow(sheet, `${item.name} (${item.count} atendimentos)`, item.revenue, "currency");
      }
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Melhores dias");
    if (current.byWeekday.length === 0) {
      addReportRow(sheet, "Sem dados no período", "");
    } else {
      for (const item of current.byWeekday) {
        addReportRow(sheet, `${item.weekday} (${item.count} atendimentos)`, item.total, "currency");
      }
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Melhores horários");
    if (current.byHour.length === 0) {
      addReportRow(sheet, "Sem dados no período", "");
    } else {
      for (const item of current.byHour) {
        addReportRow(sheet, `${item.hour} (${item.count} atendimentos)`, item.total, "currency");
      }
    }

    addBlankRow(sheet);
    addSectionRow(sheet, "Comparativo com o período anterior");
    if (!previous) {
      addReportRow(sheet, "Comparativo indisponível", "O período “Tudo” não tem período anterior equivalente.");
    } else {
      addReportRow(sheet, "Período anterior", ctx.previousPeriod?.label ?? "");
      const compare = (label: string, now: number, before: number): void => {
        const delta = now - before;
        const percent = before !== 0 ? (delta / Math.abs(before)) * 100 : null;
        const suffix = percent === null ? "" : ` (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`;
        addReportRow(sheet, `${label} — anterior`, before, "currency");
        addReportRow(sheet, `${label} — período atual`, now, "currency");
        addReportRow(sheet, `${label} — variação${suffix}`, delta, "currency");
      };
      compare("Faturamento", current.revenue, previous.revenue);
      compare("Despesas", current.expenses, previous.expenses);
      compare("Lucro líquido", current.netProfit, previous.netProfit);
      compare("Comissões", current.commissions, previous.commissions);
      addReportRow(sheet, "Atendimentos — anterior", previous.totalAppointments, "int");
      addReportRow(sheet, "Atendimentos — período atual", current.totalAppointments, "int");
      addReportRow(sheet, "Novos clientes — anterior", previous.newClients, "int");
      addReportRow(sheet, "Novos clientes — período atual", current.newClients, "int");
    }

    if (ctx.warnings.length > 0) {
      addBlankRow(sheet);
      addSectionRow(sheet, "Avisos desta emissão");
      for (const warning of ctx.warnings) {
        addReportRow(sheet, "Aviso", warning);
      }
    }
  },
};

/** ── Configurações do negócio ────────────────────────────────────────────── */

const SETTINGS_COLUMNS: ColumnSpec[] = [
  { header: "Categoria", type: "text", width: 32 },
  { header: "Configuração", type: "text", width: 42 },
  { header: "Valor", type: "text", width: 42 },
];

export const settingsSheet: SheetBuilder = {
  key: "settings",
  name: "Configurações",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, SETTINGS_COLUMNS);

    const [shop, schedules, policy, subscription] = await Promise.all([
      prisma.barbershop.findUnique({
        where: { id: ctx.shop.id },
        select: {
          name: true,
          whatsapp: true,
          cnpj: true,
          address: true,
          city: true,
          timezone: true,
          businessSegment: true,
          businessSegmentOther: true,
          operationMode: true,
          oabRegistration: true,
          socialLinks: true,
          openingMode: true,
        },
      }),
      prisma.schedule.findMany({
        where: { barbershopId: ctx.shop.id },
        orderBy: { dayOfWeek: "asc" },
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
      }),
      prisma.appointmentPolicy.findUnique({
        where: { barbershopId: ctx.shop.id },
        select: {
          bookingNoticeMinutes: true,
          cancelNoticeMinutes: true,
          rescheduleNoticeMinutes: true,
          bookingHorizonDays: true,
          allowPublicCancellation: true,
          allowPublicReschedule: true,
          requestReview: true,
          maxReschedules: true,
          lateToleranceMinutes: true,
        },
      }),
      prisma.subscription.findFirst({
        where: { barbershopId: ctx.shop.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, plan: { select: { name: true, tierKey: true } } },
      }),
    ]);

    const row = (category: string, key: string, value: unknown): void => {
      addRow(sheet, SETTINGS_COLUMNS, [category, key, value]);
    };

    row("Estabelecimento", "Nome", shop?.name);
    row("Estabelecimento", "WhatsApp", shop?.whatsapp);
    row("Estabelecimento", "CNPJ", shop?.cnpj);
    row("Estabelecimento", "Endereço", shop?.address);
    row("Estabelecimento", "Cidade", shop?.city);
    row("Estabelecimento", "Fuso horário", shop?.timezone);
    row("Estabelecimento", "Segmento", shop?.businessSegmentOther ?? shop?.businessSegment);
    row("Estabelecimento", "Modo de operação", shop?.operationMode);
    row("Estabelecimento", "Abertura da agenda", shop?.openingMode);
    if (shop?.oabRegistration) {
      row("Estabelecimento", "Registro profissional (OAB)", shop.oabRegistration);
    }
    if (shop?.socialLinks) {
      const links = JSON.stringify(shop.socialLinks);
      row("Redes sociais", "Links", safeText(links));
    }

    addBlankRow(sheet);
    for (const schedule of schedules) {
      row(
        "Horário de funcionamento",
        WEEKDAY_LABELS[schedule.dayOfWeek] ?? `Dia ${schedule.dayOfWeek}`,
        schedule.isOpen ? `${schedule.openTime} às ${schedule.closeTime}` : "Fechado",
      );
    }

    if (policy) {
      addBlankRow(sheet);
      row("Política de agenda", "Antecedência mínima para agendar (minutos)", policy.bookingNoticeMinutes);
      row("Política de agenda", "Antecedência para cancelar (minutos)", policy.cancelNoticeMinutes);
      row("Política de agenda", "Antecedência para remarcar (minutos)", policy.rescheduleNoticeMinutes);
      row("Política de agenda", "Janela de agendamento (dias)", policy.bookingHorizonDays);
      row("Política de agenda", "Cancelamento pelo público", policy.allowPublicCancellation ? "Permitido" : "Bloqueado");
      row("Política de agenda", "Remarcação pelo público", policy.allowPublicReschedule ? "Permitida" : "Bloqueada");
      row("Política de agenda", "Pedir avaliação", policy.requestReview ? "Sim" : "Não");
      row("Política de agenda", "Limite de remarcações", policy.maxReschedules);
      row("Política de agenda", "Tolerância de atraso (minutos)", policy.lateToleranceMinutes);
    }

    if (subscription) {
      addBlankRow(sheet);
      row("Plano", "Plano", subscription.plan?.name);
      row("Plano", "Situação", subscription.status);
    }
  },
};
