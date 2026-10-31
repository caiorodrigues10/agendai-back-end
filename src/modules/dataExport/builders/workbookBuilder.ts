/**
 * Orquestração da planilha: streaming do exceljs, CSVs em .zip e progresso.
 *
 * O arquivo é gerado em streaming (`stream.xlsx.WorkbookWriter`) — nenhuma aba
 * é carregada inteira em memória: as linhas são lidas por cursor, em lotes.
 */
import ExcelJS from "exceljs";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import { prisma } from "@/libs/prismaClient";
import { isModuleEnabled } from "@/shared/segments/segmentGate";
import { isAdvertisingRestricted } from "@/shared/segments/advertising";
import {
  exportFileName,
  MAX_EXPORT_FILE_SIZE_BYTES,
  MODULE_LABELS,
} from "../dataExport.constants";
import { exportTempDirectory, newExportFilePath } from "../utils/exportTempFiles";
import type { ExportModuleKey, ExportProgress } from "../dataExport.types";
import type { SheetBuilder, SheetContext } from "./sheetHelpers";
import { CsvSheetTarget, PdfSheetTarget, XlsxSheetTarget } from "./sheetHelpers";
import { leiaMeSheet, resumoSheet, settingsSheet } from "./sheets/coreSheets";
import {
  appointmentsSheet,
  clientsSheet,
  servicesSheet,
  teamSheet,
} from "./sheets/operationSheets";
import {
  cashSheet,
  closeoutSheet,
  commissionsSheet,
  depositsSheet,
  expensesSheet,
  profitSheet,
  revenueSheet,
} from "./sheets/financeSheets";
import {
  clientPackagesSheet,
  fiadoPaymentsSheet,
  fiadoSheet,
  packagesSheet,
  productsSheet,
  receiptsSheet,
  recurringPackagesSheet,
  reservationsSheet,
  salesSheet,
  stockSheet,
} from "./sheets/commerceSheets";
import {
  loyaltySheet,
  postsSheet,
  queueSheet,
  referralsSheet,
  reviewsSheet,
  vouchersSheet,
  waitlistSheet,
} from "./sheets/socialSheets";
import type { BusinessSegment } from "@prisma/client";

/** Todas as abas, na ordem em que entram na planilha. */
const ALL_SHEETS: SheetBuilder[] = [
  leiaMeSheet,
  resumoSheet,
  appointmentsSheet,
  clientsSheet,
  servicesSheet,
  teamSheet,
  revenueSheet,
  expensesSheet,
  cashSheet,
  closeoutSheet,
  profitSheet,
  depositsSheet,
  commissionsSheet,
  productsSheet,
  stockSheet,
  receiptsSheet,
  reservationsSheet,
  salesSheet,
  packagesSheet,
  clientPackagesSheet,
  recurringPackagesSheet,
  fiadoSheet,
  fiadoPaymentsSheet,
  queueSheet,
  waitlistSheet,
  reviewsSheet,
  loyaltySheet,
  referralsSheet,
  vouchersSheet,
  postsSheet,
  settingsSheet,
];

/** Módulo (chave da aba) que cada aba atende. */
const SHEET_MODULE: Record<string, ExportModuleKey | "core"> = {
  readme: "core",
  summary: "core",
  appointments: "appointments",
  clients: "clients",
  services: "services",
  team: "team",
  revenue: "financial",
  expenses: "financial",
  cash: "financial",
  closeout: "financial",
  profit: "financial",
  deposits: "financial",
  commissions: "commissions",
  products: "products",
  stock: "products",
  receipts: "products",
  reservations: "products",
  sales: "sales",
  packages: "packages",
  clientPackages: "packages",
  recurringPackages: "packages",
  fiado: "fiado",
  fiadoPayments: "fiado",
  queue: "queue",
  waitlist: "waitlist",
  reviews: "reviews",
  loyalty: "loyalty",
  referrals: "loyalty",
  vouchers: "loyalty",
  posts: "posts",
  settings: "settings",
};

/** Descrição curta de cada aba (vai no Leia-me). */
const SHEET_DESCRIPTIONS: Record<string, string> = {
  readme: "Explica o conteúdo, o período, as limitações e como reimportar.",
  summary: "Indicadores do período, por pagamento, profissional e serviço, com comparativo.",
  appointments: "Agendamentos do período com cliente, serviço, profissional e valores.",
  clients: "Cadastro de clientes, visitas, gasto, pacotes ativos e dívidas.",
  services: "Catálogo de serviços, variações, adicionais e desempenho no período.",
  team: "Equipe, horário de trabalho, folgas, metas e produtividade.",
  revenue: "Receitas do período (agenda e fila), por atendimento.",
  expenses: "Despesas por data, categoria e valor.",
  cash: "Movimentos de caixa (entradas e saídas) do período.",
  closeout: "Fechamento diário do caixa.",
  profit: "Lucro por mês dentro do período.",
  deposits: "Depósitos e sinais de agendamentos.",
  commissions: "Comissões por profissional e por lançamento.",
  products: "Catálogo de produtos com preço, custo e estoque atual.",
  stock: "Movimentos de estoque do período.",
  receipts: "Compras e recebimentos de mercadoria.",
  reservations: "Reservas de produtos.",
  sales: "Vendas de produtos (PDV) no período.",
  packages: "Catálogo de pacotes de serviço.",
  clientPackages: "Pacotes comprados pelos clientes e saldo de sessões.",
  recurringPackages: "Assinaturas/pacotes recorrentes e uso no período.",
  fiado: "Dívidas de fiado e saldo em aberto.",
  fiadoPayments: "Pagamentos de fiado no período.",
  queue: "Atendimentos da fila no período.",
  waitlist: "Entradas e ofertas da lista de espera.",
  reviews: "Avaliações publicadas e Respondidas.",
  loyalty: "Contas de fidelidade dos clientes.",
  referrals: "Indicações e recompensas.",
  vouchers: "Cupons e vouchers do estabelecimento.",
  posts: "Metadados de posts e galeria (sem imagens).",
  settings: "Dados cadastrais, horários, políticas e plano.",
};

export interface BuildExportOptions {
  exportId: string;
  barbershopId: string;
  modules: ExportModuleKey[];
  format: "XLSX" | "CSV_ZIP" | "PDF";
  period: SheetContext["period"];
  previousPeriod: SheetContext["previousPeriod"];
  options: SheetContext["options"];
  generatedAt: Date;
  onProgress: (progress: ExportProgress) => Promise<void>;
}

export interface BuildExportResult {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  warnings: string[];
}

/** Constrói o contexto da exportação a partir do salão. */
async function buildContext(opts: BuildExportOptions): Promise<SheetContext> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: opts.barbershopId },
    select: {
      id: true,
      name: true,
      city: true,
      whatsapp: true,
      cnpj: true,
      address: true,
      businessSegment: true,
      oabRegistration: true,
      timezone: true,
      operationMode: true,
      socialLinks: true,
    },
  });
  if (!shop) throw new Error("Estabelecimento não encontrado para a exportação.");

  const segment = shop.businessSegment as BusinessSegment | null;
  const warnings: string[] = [];

  const available = new Set<ExportModuleKey>();
  for (const module of opts.modules) {
    if (module === "products" || module === "sales") {
      if (!isModuleEnabled(segment, "products")) continue;
    }
    if (module === "commissions" && !isModuleEnabled(segment, "commissions")) continue;
    if (
      (module === "reviews" || module === "loyalty") &&
      isAdvertisingRestricted(segment)
    ) {
      continue;
    }
    available.add(module);
  }

  return {
    shop: {
      id: shop.id,
      name: shop.name,
      city: shop.city,
      whatsapp: shop.whatsapp,
      cnpj: shop.cnpj,
      address: shop.address,
      businessSegment: shop.businessSegment,
      oabRegistration: shop.oabRegistration,
      timezone: shop.timezone,
      operationMode: shop.operationMode,
      socialLinks: shop.socialLinks,
    },
    period: opts.period,
    previousPeriod: opts.previousPeriod,
    options: opts.options,
    segment: shop.businessSegment,
    generatedAt: opts.generatedAt,
    warnings,
    includedSheets: [],
  };
}

/** Abas que entram na planilha (módulo pedido + gate do segmento). */
export function selectSheets(modules: ExportModuleKey[]): SheetBuilder[] {
  return ALL_SHEETS.filter((sheet) => {
    const module = SHEET_MODULE[sheet.key];
    if (module === "core") return true;
    return modules.includes(module);
  });
}

/** Gera o arquivo da exportação (xlsx ou zip de csvs). */
export async function buildExportFile(opts: BuildExportOptions): Promise<BuildExportResult> {
  const ctx = await buildContext(opts);
  const sheets = selectSheets(opts.modules);
  ctx.includedSheets = sheets.map((sheet) => ({
    key: sheet.key,
    name: sheet.name,
    description: SHEET_DESCRIPTIONS[sheet.key] ?? "",
  }));

  const extension = opts.format === "CSV_ZIP" ? "zip" : opts.format === "PDF" ? "pdf" : "xlsx";
  const filePath = newExportFilePath(extension);
  const fileName = exportFileName(
    ctx.shop.name,
    opts.period.preset as never,
    opts.generatedAt,
    extension,
  );

  if (opts.format === "CSV_ZIP") {
    await buildCsvZip(opts, ctx, sheets, filePath);
  } else if (opts.format === "PDF") {
    await buildPdf(opts, ctx, sheets, filePath);
  } else {
    await buildXlsx(opts, ctx, sheets, filePath);
  }

  const { stat } = await import("node:fs/promises");
  const info = await stat(filePath);
  if (info.size > MAX_EXPORT_FILE_SIZE_BYTES) {
    const { deleteExportFile } = await import("../utils/exportTempFiles");
    await deleteExportFile(filePath);
    throw new Error(
      "O arquivo ficou maior que o limite permitido. Reduza o período ou desmarque alguns módulos.",
    );
  }

  return { filePath, fileName, fileSizeBytes: info.size, warnings: ctx.warnings };
}

/** Gera o .xlsx em streaming. */
async function buildXlsx(
  opts: BuildExportOptions,
  ctx: SheetContext,
  sheets: SheetBuilder[],
  filePath: string,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: true,
    useSharedStrings: true,
  });

  let sheetsDone = 0;
  let rowsWritten = 0;

  for (const sheetBuilder of sheets) {
    const worksheet = workbook.addWorksheet(sheetBuilder.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    await sheetBuilder.build(ctx, new XlsxSheetTarget(worksheet));
    worksheet.commit();
    sheetsDone += 1;

    await opts.onProgress({
      currentSheet: sheetBuilder.name,
      sheetsDone,
      sheetsTotal: sheets.length,
      rowsWritten,
      skippedSheets: [],
    });
  }

  await workbook.commit();
}

/** Gera um .zip com um CSV por aba (escrita direta, sem xlsx intermediário). */
async function buildCsvZip(
  opts: BuildExportOptions,
  ctx: SheetContext,
  sheets: SheetBuilder[],
  filePath: string,
): Promise<void> {
  const workDir = join(exportTempDirectory(), `csv-${randomUUID()}`);
  await mkdir(workDir, { recursive: true, mode: 0o700 });

  try {
    let sheetsDone = 0;
    for (const sheetBuilder of sheets) {
      const target = new CsvSheetTarget();
      await sheetBuilder.build(ctx, target);
      const csv = target.rows.map((row) => row.join(";")).join("\r\n");
      // BOM no começo: o Excel pt-BR abre UTF-8 sem mojibake.
      await writeFile(join(workDir, `${sheetBuilder.name}.csv`), `﻿${csv}\r\n`, {
        encoding: "utf8",
        mode: 0o600,
      });

      sheetsDone += 1;
      await opts.onProgress({
        currentSheet: sheetBuilder.name,
        sheetsDone,
        sheetsTotal: sheets.length,
        rowsWritten: target.rows.length,
        skippedSheets: [],
      });
    }

    // Compacta os CSVs.
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filePath, { mode: 0o600 });
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", () => resolve());
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      for (const sheetBuilder of sheets) {
        archive.file(join(workDir, `${sheetBuilder.name}.csv`), {
          name: `${sheetBuilder.name}.csv`,
        });
      }
      void archive.finalize();
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export { MODULE_LABELS };

/** Gera um PDF organizado com uma tabela por aba. */
async function buildPdf(
  opts: BuildExportOptions,
  ctx: SheetContext,
  sheets: SheetBuilder[],
  filePath: string,
): Promise<void> {
  // Coleta os dados de cada aba (mesmo builder, destino em memória).
  const collected: Array<{ name: string; rows: unknown[][] }> = [];
  for (const sheetBuilder of sheets) {
    const target = new PdfSheetTarget();
    await sheetBuilder.build(ctx, target);
    collected.push({ name: sheetBuilder.name, rows: target.rows });
  }

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const stream = (await import("node:fs")).createWriteStream(filePath, { mode: 0o600 });
  doc.pipe(stream);

  // ── Capa / cabeçalho ──────────────────────────────────────────────────────
  doc.fontSize(20).font("Helvetica-Bold").text("Exportação de dados — Agendaí", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica").text(`Estabelecimento: ${ctx.shop.name}`);
  doc.text(`Período: ${ctx.period.label}`);
  doc.text(`Fuso horário: ${ctx.period.timezone}`);
  doc.text(`Gerada em: ${ctx.generatedAt.toLocaleString("pt-BR", { timeZone: "UTC" })}`);
  doc.text(`Formato: PDF (somente leitura)`);
  if (ctx.options.anonymize) {
    doc.text("Dados pessoais: anonimizados (nomes, telefones e e-mails mascarados).");
  }
  if (ctx.warnings.length > 0) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Avisos:");
    doc.font("Helvetica");
    for (const warning of ctx.warnings) doc.text(`• ${warning}`);
  }
  doc.moveDown(1);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (const sheet of collected) {
    if (sheet.rows.length === 0) continue;

    // Quebra de página antes de cada aba (exceto a primeira se couber).
    if (doc.y > doc.page.height - 120) doc.addPage();

    doc.fontSize(14).font("Helvetica-Bold").text(sheet.name, { underline: true });
    doc.moveDown(0.4);

    const header = sheet.rows[0] as unknown[];
    const dataRows = sheet.rows.slice(1);
    const numCols = header.length || 1;

    // Largura por coluna: proporcional ao maior conteúdo, limitada.
    const colWidths = computeColumnWidths(header, dataRows, pageWidth, numCols);

    renderTable(doc, header, dataRows, colWidths, pageWidth);

    doc.moveDown(1);
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

/** Larguras de coluna para o PDF (heurística por conteúdo). */
function computeColumnWidths(
  header: unknown[],
  dataRows: unknown[][],
  pageWidth: number,
  numCols: number,
): number[] {
  const sample = dataRows.slice(0, 50);
  const widths = new Array(numCols).fill(0);
  for (let c = 0; c < numCols; c += 1) {
    const headerLen = String(header[c] ?? "").length;
    let max = headerLen;
    for (const row of sample) {
      const len = String(row[c] ?? "").length;
      if (len > max) max = len;
    }
    widths[c] = Math.min(40, Math.max(6, max + 2));
  }
  const total = widths.reduce((sum, w) => sum + w, 0);
  const scale = total > 0 ? pageWidth / (total * 6) : 1;
  // Converte "caracteres" em pontos (≈6pt por caractere) e escala para caber.
  return widths.map((w) => Math.max(30, Math.min(pageWidth / numCols, w * 6 * Math.min(1, scale))));
}

/** Renderiza uma tabela no PDF com quebra de página automática. */
function renderTable(
  doc: PDFKit.PDFDocument,
  header: unknown[],
  dataRows: unknown[][],
  colWidths: number[],
  pageWidth: number,
): void {
  const rowHeight = 12;
  const headerFill = "#1F2937";

  const drawHeader = (): void => {
    let x = doc.page.margins.left;
    const y = doc.y;
    doc.rect(x, y, pageWidth, rowHeight + 4).fill(headerFill);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    header.forEach((cell, index) => {
      doc.text(String(cell ?? ""), x + 2, y + 2, {
        width: colWidths[index] - 4,
        height: rowHeight + 4,
        ellipsis: true,
      });
      x += colWidths[index];
    });
    doc.fillColor("#000000");
    doc.y = y + rowHeight + 6;
  };

  drawHeader();

  doc.font("Helvetica").fontSize(8);
  for (const row of dataRows) {
    if (doc.y + rowHeight + 6 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(8);
    }
    let x = doc.page.margins.left;
    const y = doc.y;
    row.forEach((cell, index) => {
      const text = formatPdfCell(cell);
      doc.text(text, x + 2, y + 1, {
        width: colWidths[index] - 4,
        height: rowHeight + 4,
        ellipsis: true,
      });
      x += colWidths[index];
    });
    // linha divisória
    doc
      .moveTo(doc.page.margins.left, doc.y + rowHeight + 2)
      .lineTo(doc.page.margins.left + pageWidth, doc.y + rowHeight + 2)
      .strokeColor("#E5E7EB")
      .stroke();
    doc.y = y + rowHeight + 4;
  }
}

/** Formata um valor para o PDF (data em dd/mm/aaaa, número em pt-BR). */
function formatPdfCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return value.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}
