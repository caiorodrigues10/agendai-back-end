/**
 * Abas de casos e honorários de êxito (escritório de advocacia).
 *
 * Regras de sigilo:
 *   • `cases` só entra na planilha quando o segmento é LAW_FIRM E a opção
 *     `includeCase` está ligada — sem opção explícita, nenhum dado de caso/processo
 *     sai da exportação (mesma regra do relatório de honorários).
 *   • `caseFees` entra para escritórios jurídicos mesmo sem `includeCase`,
 *     mas colunas que identificam o processo (número, apelido) saem vazias
 *     quando a opção está desligada.
 *   • Honorários nunca entram no caixa nem no financeiro: não há coluna de
 *     pagamento, lançamento ou recebimento.
 */
import { prisma } from "@/libs/prismaClient";
import {
  addBlankRow,
  addRow,
  addSectionRow,
  setupSheet,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { safeText } from "../../utils/cellSafety";

const CASE_STATUS_LABELS: Record<string, string> = {
  LEAD: "Prospecção",
  ACTIVE: "Em andamento",
  AWAITING_CLIENT: "Aguardando cliente",
  IN_COURT: "Em juízo",
  SUSPENDED: "Suspenso",
  CLOSED: "Encerrado",
  ARCHIVED: "Arquivado",
};

const CASE_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

const FEE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  INVOICED: "Faturado",
  PAID: "Pago",
  CANCELED: "Cancelado",
};

/** ── Processos (cases) ──────────────────────────────────────────────────── */

const CASES_COLUMNS: ColumnSpec[] = [
  { header: "Apelido do caso", type: "text", width: 26 },
  { header: "Número do processo", type: "text", width: 22 },
  { header: "Cliente", type: "text", width: 24 },
  { header: "WhatsApp do cliente", type: "text", width: 16 },
  { header: "Área de atuação", type: "text", width: 18 },
  { header: "Situação", type: "text", width: 16 },
  { header: "Prioridade", type: "text", width: 12 },
  { header: "Título", type: "text", width: 30 },
  { header: "Órgão julgador / vara", type: "text", width: 24 },
  { header: "Parte adversária", type: "text", width: 24 },
  { header: "Valor da causa", type: "currency", width: 16 },
  { header: "Valor obtido", type: "currency", width: 16 },
  { header: "Data de abertura", type: "date", width: 12 },
  { header: "Advogado responsável", type: "text", width: 20 },
  { header: "Compartilhado com cliente", type: "bool", width: 20 },
  { header: "ID", type: "text", width: 36 },
];

export const casesSheet: SheetBuilder = {
  key: "cases",
  name: "Processos",
  enabled: false, // só entra com gate de segmento + includeCase no selectSheets
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CASES_COLUMNS);

    const cases = await prisma.clientCase.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        nickname: true,
        caseNumber: true,
        practiceArea: true,
        status: true,
        priority: true,
        title: true,
        courtName: true,
        opponent: true,
        claimedAmount: true,
        awardedAmount: true,
        openedAt: true,
        shareWithClient: true,
        client: {
          select: {
            name: true,
            whatsapp: true,
          },
        },
        responsibleStaff: {
          select: {
            name: true,
          },
        },
      },
    });

    for (const item of cases) {
      addRow(sheet, CASES_COLUMNS, [
        item.nickname,
        item.caseNumber ?? "",
        item.client?.name ?? "",
        item.client?.whatsapp ?? "",
        item.practiceArea ?? "",
        CASE_STATUS_LABELS[item.status] ?? item.status,
        CASE_PRIORITY_LABELS[item.priority] ?? item.priority,
        item.title ?? "",
        item.courtName ?? "",
        item.opponent ?? "",
        item.claimedAmount ?? null,
        item.awardedAmount ?? null,
        item.openedAt,
        item.responsibleStaff?.name ?? "",
        item.shareWithClient,
        item.id,
      ]);
    }
  },
};

/** ── Honorários de êxito (caseFees) ─────────────────────────────────────── */

const CASE_FEES_COLUMNS: ColumnSpec[] = [
  { header: "Número do processo", type: "text", width: 22 },
  { header: "Apelido do caso", type: "text", width: 26 },
  { header: "Percentual (%)", type: "decimal", width: 14 },
  { header: "Valor base (R$)", type: "currency", width: 16 },
  { header: "Valor do honorário (R$)", type: "currency", width: 18 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Vencimento", type: "date", width: 12 },
  { header: "Parcelas", type: "int", width: 10 },
  { header: "Observações", type: "text", width: 30 },
  { header: "Data de criação", type: "datetime", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

export const caseFeesSheet: SheetBuilder = {
  key: "caseFees",
  name: "Honorários de êxito",
  enabled: false, // só entra com gate de segmento no selectSheets
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CASE_FEES_COLUMNS);

    const showCaseData = ctx.options.includeCase === true;

    const fees = await prisma.caseSuccessFee.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        percent: true,
        baseAmount: true,
        amount: true,
        status: true,
        dueDate: true,
        installments: true,
        notes: true,
        createdAt: true,
        case: {
          select: {
            id: true,
            nickname: true,
            caseNumber: true,
          },
        },
      },
    });

    for (const item of fees) {
      const caseNumber = showCaseData ? (item.case?.caseNumber ?? "") : "";
      const caseName = showCaseData ? (item.case?.nickname ?? "") : "";

      addRow(sheet, CASE_FEES_COLUMNS, [
        caseNumber,
        caseName,
        item.percent ?? null,
        item.baseAmount ?? null,
        item.amount ?? null,
        FEE_STATUS_LABELS[item.status] ?? item.status,
        item.dueDate,
        item.installments,
        item.notes ?? "",
        item.createdAt,
        item.id,
      ]);
    }
  },
};
