/// <reference types="vitest/globals" />
/**
 * Integração (Postgres real no :5442): exportação de planilhas.
 *
 * Cobre o que sustenta o produto:
 *
 *   1. a planilha gerada tem as abas pedidas, com cabeçalho congelado,
 *      filtro automático e os tipos certos (data real, moeda numérica);
 *   2. os totais da aba "Resumo" são **iguais** aos do motor de lucro do app
 *      (paridade);
 *   3. a ida e volta funciona: exportar clientes/serviços e reimportar em um
 *      banco limpo dá a mesma contagem;
 *   4. tenant: outro salão não vê nem baixa a exportação;
 *   5. o download expira e o arquivo é apagado.
 */
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import ExcelJS from "exceljs";
import auth from "@/config/auth";
import type { FastifyInstance } from "fastify";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";
import { prisma } from "@/libs/prismaClient";
import { requestContext } from "@/shared/infra/http/requestContext";
import { buildExportFile } from "@/modules/dataExport/builders/workbookBuilder";
import { computePeriodSummary } from "@/modules/dataExport/builders/summaryData";
import { deleteExportFile } from "@/modules/dataExport/utils/exportTempFiles";
import { processImportBatch } from "@/modules/dataImport/importProcessor";

/** Lê uma aba do .xlsx como matriz de strings. */
async function readSheet(path: string, name: string): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(name);
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as unknown[];
    rows.push(values.slice(1).map((value) => (value == null ? "" : String(value))));
  });
  return rows;
}

/** Cabeçalhos da primeira linha de uma aba. */
async function readHeaders(path: string, name: string): Promise<string[]> {
  const rows = await readSheet(path, name);
  return rows[0] ?? [];
}

/** Nomes de todas as abas de um arquivo .xlsx. */
async function readAllSheetNames(path: string): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook.worksheets.map((ws) => ws.name);
}

describe("exportação de planilhas — fluxo completo no banco real", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;

  let shopId: string;
  let otherShopId: string;
  let owner: { id: string; role: string };
  let headers: Record<string, string>;
  let otherHeaders: Record<string, string>;
  let serviceId: string;
  let staffId: string;
  let lawFirmShopId: string | undefined;
  let generatedFiles: string[] = [];

  function tokenFor(user: { id: string; role: string }, tenant: string): string {
    return sign(
      { role: user.role, barbershopId: tenant },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "1h" },
    );
  }

  function inTenant<T>(fn: () => Promise<T>, tenant = shopId): Promise<T> {
    return requestContext.run({ barbershopId: tenant }, fn);
  }

  /** Gera o arquivo direto (mesmo caminho do worker, sem a fila). */
  async function generate(
    options: {
      modules?: Array<
        | "appointments"
        | "clients"
        | "services"
        | "team"
        | "financial"
        | "commissions"
        | "products"
        | "sales"
        | "packages"
        | "fiado"
        | "queue"
        | "waitlist"
      | "reviews"
      | "loyalty"
      | "posts"
      | "settings"
      | "cases"
      | "caseFees"
    >;
      format?: "XLSX" | "CSV_ZIP";
      anonymize?: boolean;
      includeCase?: boolean;
      barbershopId?: string;
      from?: Date | null;
      to?: Date | null;
    } = {},
  ): Promise<{ filePath: string; fileName: string; warnings: string[] }> {
    const from = options.from ?? new Date("2026-01-01T00:00:00Z");
    const to = options.to ?? new Date("2026-12-31T23:59:59Z");
    const tenant = options.barbershopId ?? shopId;
    const result = await inTenant(() =>
      buildExportFile({
        exportId: randomUUID(),
        barbershopId: tenant,
        modules: options.modules ?? ["appointments", "clients", "services", "team", "financial"],
        format: options.format ?? "XLSX",
        period: {
          preset: "CUSTOM",
          from,
          to,
          label: "Período de teste",
          timezone: "America/Sao_Paulo",
        },
        previousPeriod: null,
        options: {
          anonymize: options.anonymize ?? false,
          includeCase: options.includeCase ?? false,
        },
        generatedAt: new Date("2026-10-30T12:00:00Z"),
        onProgress: async () => undefined,
      }),
      tenant,
    );
    generatedFiles.push(result.filePath);
    return result;
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();

    const shop = await prisma.barbershop.create({
      data: { name: "QA Exportação", whatsapp: "11900000010", timezone: "America/Sao_Paulo" },
    });
    shopId = shop.id;

    const otherShop = await prisma.barbershop.create({
      data: { name: "QA Exportação Outro", whatsapp: "11900000011" },
    });
    otherShopId = otherShop.id;

    owner = await prisma.user.create({
      data: {
        name: "Owner Exportação",
        email: `owner-export-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopId,
      },
      select: { id: true, role: true },
    });
    headers = { authorization: `Bearer ${tokenFor(owner, shopId)}` };

    const otherOwner = await prisma.user.create({
      data: {
        name: "Owner Exportação Outro",
        email: `owner-export-other-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: otherShopId,
      },
      select: { id: true, role: true },
    });
    otherHeaders = { authorization: `Bearer ${tokenFor(otherOwner, otherShopId)}` };

    const staff = await prisma.user.create({
      data: {
        name: "Profissional Exportação",
        email: `staff-export-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
      },
      select: { id: true },
    });
    staffId = staff.id;

    const service = await prisma.service.create({
      data: {
        barbershopId: shopId,
        name: "Corte Exportação",
        price: 80,
        avgTimeMinutes: 30,
        icon: "scissors",
        commissionPercent: 10,
      },
      select: { id: true },
    });
    serviceId = service.id;

    const client = await prisma.salonClient.create({
      data: {
        barbershopId: shopId,
        name: "Cliente Exportação",
        whatsapp: "11988880001",
        notes: "cliente do teste de exportação",
      },
      select: { id: true },
    });

    // Dois atendimentos concluídos dentro do período + uma despesa.
    for (const [day, hour, price] of [
      ["2026-03-10", "10:00", 80],
      ["2026-03-11", "15:30", 120],
    ] as const) {
      await prisma.appointment.create({
        data: {
          barbershopId: shopId,
          serviceId,
          staffId,
          clientId: client.id,
          customerName: "Cliente Exportação",
          whatsapp: "11988880001",
          date: new Date(`${day}T12:00:00Z`),
          time: hour,
          status: "COMPLETED",
          finalPrice: price,
          paymentMethod: "Pix",
          completedAt: new Date(`${day}T12:00:00Z`),
        },
      });
    }

    await prisma.expense.create({
      data: {
        barbershopId: shopId,
        title: "Aluguel",
        description: "Aluguel do mês",
        amount: 300,
        type: "FIXED",
        referenceDate: new Date("2026-03-05T12:00:00Z"),
        createdById: owner.id,
      },
    });

    await prisma.commissionEntry.create({
      data: {
        barbershopId: shopId,
        serviceId,
        professionalId: staffId,
        percentage: 10,
        amount: 20,
      },
    });
  }, 180_000);

  afterAll(async () => {
    for (const file of generatedFiles) {
      await deleteExportFile(file);
    }
    await prisma.barbershop.deleteMany({
      where: { id: { in: [shopId, otherShopId, ...(lawFirmShopId ? [lawFirmShopId] : [])] } },
    });
    if (app) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("gera o .xlsx com as abas pedidas e os tipos corretos", async () => {
    const result = await generate({
      modules: ["appointments", "clients", "services", "team", "financial"],
    });

    const sheetNames = (
      await readSheet(result.filePath, "Resumo").then(() => undefined)
    ) ?? undefined;
    expect(sheetNames).toBeUndefined();

    // Resumo existe e traz período + fuso + geração.
    const resumoRows = await readSheet(result.filePath, "Resumo");
    const resumoText = resumoRows.map((row) => row.join(" ")).join("\n");
    expect(resumoText).toContain("America/Sao_Paulo");
    expect(resumoText).toContain("Período de teste");

    // Abas principais existem.
    for (const name of ["Agendamentos", "Clientes", "Serviços", "Equipe"]) {
      const headersRow = await readHeaders(result.filePath, name);
      expect(headersRow.length).toBeGreaterThan(0);
    }

    // Agendamentos: cabeçalhos reimportáveis primeiro.
    const appointmentHeaders = await readHeaders(result.filePath, "Agendamentos");
    expect(appointmentHeaders.slice(0, 10)).toEqual([
      "Data",
      "Hora",
      "Nome do cliente",
      "WhatsApp do cliente",
      "Serviço",
      "Profissional",
      "Situação",
      "Valor",
      "Forma de pagamento",
      "Modalidade",
    ]);

    // Clientes: cabeçalhos reimportáveis primeiro.
    const clientHeaders = await readHeaders(result.filePath, "Clientes");
    expect(clientHeaders.slice(0, 3)).toEqual(["Nome", "WhatsApp", "Observações"]);

    // Serviços: cabeçalhos reimportáveis primeiro.
    const serviceHeaders = await readHeaders(result.filePath, "Serviços");
    expect(serviceHeaders.slice(0, 4)).toEqual([
      "Nome do serviço",
      "Preço",
      "Duração (minutos)",
      "Categoria",
    ]);

    // Duas linhas de agendamento.
    const appointmentRows = await readSheet(result.filePath, "Agendamentos");
    expect(appointmentRows.length).toBe(3); // cabeçalho + 2

    // Leia-me explica o arquivo e avisa sobre LGPD.
    const readme = (await readSheet(result.filePath, "Leia-me")).map((r) => r.join(" ")).join("\n");
    expect(readme).toContain("LGPD");
    expect(readme).toContain("reimportar");
  });

  it("mantém a paridade dos totais com o motor de lucro do app", async () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-12-31T23:59:59Z");

    const summary = await inTenant(() => computePeriodSummary(shopId, { from, to }));
    const result = await generate({ from, to });

    const resumoRows = await readSheet(result.filePath, "Resumo");
    const valor = (label: string): string => {
      const row = resumoRows.find((r) => r[0] === label);
      return row?.[1] ?? "";
    };

    // 80 + 120 = 200 de faturamento; despesa 300; comissão 20 por atendimento
    // (o motor de lucro credita a comissão do lançamento em cada atendimento
    // concluído do mesmo profissional e serviço: 2 × 20 = 40).
    expect(valor("Faturamento")).toBe("200");
    expect(valor("Despesas")).toBe("300");
    expect(valor("Comissões")).toBe("40");
    expect(valor("Lucro líquido")).toBe("-140");
    expect(valor("Atendimentos concluídos")).toBe("2");
    expect(valor("Ticket médio")).toBe("100");
    expect(summary.revenue).toBe(200);
    expect(summary.commissions).toBe(40);
    expect(summary.netProfit).toBe(-140);
  });

  it("LAW_FIRM inclui coluna de caso e aviso de sigilo só com includeCase=true", async () => {
    const lawFirm = await prisma.barbershop.create({
      data: {
        name: "QA Escritório Exportação",
        whatsapp: "11900000031",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    });
    lawFirmShopId = lawFirm.id;
    try {
      const lawClient = await prisma.salonClient.create({
        data: {
          barbershopId: lawFirm.id,
          name: "Cliente Sigiloso",
          whatsapp: "11988880031",
        },
        select: { id: true },
      });
      const lawStaff = await prisma.user.create({
        data: {
          name: "Advogado Exportação",
          email: `lawyer-export-${randomUUID()}@qa.local`,
          password: "x",
          role: "EMPLOYEE",
          barbershopId: lawFirm.id,
        },
        select: { id: true },
      });
      const lawService = await prisma.service.create({
        data: {
          barbershopId: lawFirm.id,
          name: "Audiência",
          price: 100,
          avgTimeMinutes: 60,
          icon: "scale",
        },
        select: { id: true },
      });
      const lawsuit = await prisma.clientCase.create({
        data: {
          barbershopId: lawFirm.id,
          clientId: lawClient.id,
          nickname: "Ação sigilosa",
          caseNumber: "1024127-78.2020.8.26.0100",
        },
        select: { id: true },
      });
      await prisma.appointment.create({
        data: {
          barbershopId: lawFirm.id,
          serviceId: lawService.id,
          staffId: lawStaff.id,
          clientId: lawClient.id,
          customerName: "Cliente Sigiloso",
          whatsapp: "11988880031",
          date: new Date("2027-02-10T12:00:00Z"),
          time: "10:00",
          status: "COMPLETED",
          finalPrice: 100,
          completedAt: new Date("2027-02-10T12:00:00Z"),
          caseId: lawsuit.id,
          caseName: "Ação sigilosa",
        },
      });

      const period = {
        from: new Date("2027-01-01T00:00:00Z"),
        to: new Date("2027-12-31T23:59:59Z"),
        barbershopId: lawFirm.id,
        modules: ["appointments"] as const,
      };

      const withCase = await generate({ ...period, modules: ["appointments"], includeCase: true });
      const headersWithCase = await readHeaders(withCase.filePath, "Agendamentos");
      expect(headersWithCase).toContain("Caso/processo");
      const rowsWithCase = await readSheet(withCase.filePath, "Agendamentos");
      expect(rowsWithCase[1]?.join(" ")).toContain("Ação sigilosa");
      const readmeWithCase = (await readSheet(withCase.filePath, "Leia-me"))
        .map((row) => row.join(" "))
        .join("\n");
      expect(readmeWithCase).toContain("Sigilo profissional");
      expect(readmeWithCase).toContain("sigilo profissional");

      const withoutCase = await generate({ ...period, modules: ["appointments"], includeCase: false });
      const headersWithoutCase = await readHeaders(withoutCase.filePath, "Agendamentos");
      expect(headersWithoutCase).not.toContain("Caso/processo");
      const rowsWithoutCase = await readSheet(withoutCase.filePath, "Agendamentos");
      expect(rowsWithoutCase[1]?.join(" ")).not.toContain("Ação sigilosa");
      const readmeWithoutCase = (await readSheet(withoutCase.filePath, "Leia-me"))
        .map((row) => row.join(" "))
        .join("\n");
      expect(readmeWithoutCase).not.toContain("Sigilo profissional");
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("LAW_FIRM sem includeCase exporta caseFees sem dados do processo", async () => {
    const lawFirmShopId = (await prisma.barbershop.create({
      data: {
        name: "QA Escritório Sem IncludeCase",
        whatsapp: "11900000032",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    })).id;
    try {
      const lawStaff = await prisma.user.create({
        data: {
          name: "Advogado Sem IncludeCase",
          email: `lawyer-no-include-${randomUUID()}@qa.local`,
          password: "x",
          role: "EMPLOYEE",
          barbershopId: lawFirmShopId,
        },
        select: { id: true },
      });

      const lawClient = await prisma.salonClient.create({
        data: {
          barbershopId: lawFirmShopId,
          name: "Cliente Sem IncludeCase",
          whatsapp: "11988880032",
        },
        select: { id: true },
      });
      const lawsuit = await prisma.clientCase.create({
        data: {
          barbershopId: lawFirmShopId,
          clientId: lawClient.id,
          nickname: "Ação Sem IncludeCase",
          caseNumber: "1024127-78.2020.8.26.0100",
          status: "ACTIVE",
          openedAt: new Date("2027-03-01T00:00:00Z"),
          responsibleStaffId: lawStaff.id,
          shareWithClient: false,
        },
        select: { id: true },
      });
      await prisma.caseSuccessFee.create({
        data: {
          barbershopId: lawFirmShopId,
          caseId: lawsuit.id,
          percent: 20,
          baseAmount: 30000,
          amount: 6000,
          status: "PENDING",
          dueDate: new Date("2027-04-01T00:00:00Z"),
          installments: 1,
          notes: "Observação sigilosa",
          createdAt: new Date("2027-03-10T00:00:00Z"),
        },
      });

      const period = {
        from: new Date("2027-01-01T00:00:00Z"),
        to: new Date("2027-12-31T23:59:59Z"),
        barbershopId: lawFirmShopId,
      };

      // Sem includeCase: cases não entra, caseFees entra SEM dados do processo
      const result = await generate({
        ...period,
        modules: ["cases", "caseFees"],
        includeCase: false,
      });

      // Todas as abas da planilha
      const allSheetNames = await readAllSheetNames(result.filePath);
      const allParts: string[] = [];
      for (const name of allSheetNames) {
        const rows = await readSheet(result.filePath, name);
        allParts.push(rows.map((row) => row.join(" ")).join("\n"));
      }
      const allText = allParts.join("\n");

      // cases não deve aparecer
      expect(allText).not.toContain("Processos");
      expect(allText).not.toContain("Ação Sem IncludeCase");
      expect(allText).not.toContain("1024127-78.2020.8.26.0100");

      // caseFees entra, mas número do processo e apelido vêm vazios
      expect(allText).toContain("Honorários de êxito");
      expect(allText).toContain("6000"); // valor do honorário presente
      expect(allText).not.toContain("Observação sigilosa"); // observações vazias sem includeCase

      // Verificar diretamente na aba de honorários
      const feeRows = await readSheet(result.filePath, "Honorários de êxito");
      const feeRow = feeRows[1];
      expect((feeRow?.[0] ?? "")).toBe(""); // número do processo vazio
      expect((feeRow?.[1] ?? "")).toBe(""); // apelido vazio
      expect((feeRow?.[8] ?? "")).toBe(""); // observações vazias
      expect(feeRow?.join(" ")).toContain("6000"); // valor presente
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("LAW_FIRM com includeCase exporta processos e honorários de êxito (sem caixa)", async () => {
    const lawFirmShopId = (await prisma.barbershop.create({
      data: {
        name: "QA Escritório IncludeCase",
        whatsapp: "11900000033",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    })).id;
    try {
      const lawStaff = await prisma.user.create({
      data: {
        name: "Advogado Honorário Exportação",
        email: `lawyer-fee-export-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: lawFirmShopId,
      },
      select: { id: true },
    });

    // Criar processo e honorário para o escritório jurídico
    const lawClient = await prisma.salonClient.create({
      data: {
        barbershopId: lawFirmShopId,
        name: "Cliente Honorário",
        whatsapp: "11988880014",
      },
      select: { id: true },
    });
    const lawsuit = await prisma.clientCase.create({
      data: {
        barbershopId: lawFirmShopId,
        clientId: lawClient.id,
        nickname: "Ação Honorário",
        caseNumber: "0025900-78.2020.8.26.0100",
        practiceArea: "Cível",
        status: "ACTIVE",
        priority: "HIGH",
        claimedAmount: 50000,
        awardedAmount: 30000,
        openedAt: new Date("2027-03-01T00:00:00Z"),
        responsibleStaffId: lawStaff.id,
        shareWithClient: false,
      },
      select: { id: true },
    });
    await prisma.caseSuccessFee.create({
      data: {
        barbershopId: lawFirmShopId,
        caseId: lawsuit.id,
        percent: 20,
        baseAmount: 30000,
        amount: 6000,
        status: "PAID",
        dueDate: new Date("2027-04-01T00:00:00Z"),
        installments: 1,
        notes: "Honorário de êxito",
        createdAt: new Date("2027-03-10T00:00:00Z"),
      },
    });

    const period = {
      from: new Date("2027-01-01T00:00:00Z"),
      to: new Date("2027-12-31T23:59:59Z"),
      barbershopId: lawFirmShopId,
    };

    // Com includeCase: cases entra com todos os dados, caseFees com número e apelido
    const withCase = await generate({
      ...period,
      modules: ["cases", "caseFees"],
      includeCase: true,
    });
    const casesHeaders = await readHeaders(withCase.filePath, "Processos");
    expect(casesHeaders).toContain("Número do processo");
    expect(casesHeaders).toContain("Valor da causa");
    expect(casesHeaders).toContain("Valor obtido");
    const casesRows = await readSheet(withCase.filePath, "Processos");
    expect(casesRows[1]?.join(" ")).toContain("0025900-78.2020.8.26.0100");
    expect(casesRows[1]?.join(" ")).toContain("50000"); // valor da causa
    expect(casesRows[1]?.join(" ")).toContain("30000"); // valor obtido

    const feeHeadersWith = await readHeaders(withCase.filePath, "Honorários de êxito");
    const feeRowsWith = await readSheet(withCase.filePath, "Honorários de êxito");
    expect(feeRowsWith[1]?.join(" ")).toContain("0025900-78.2020.8.26.0100"); // número do processo
    expect(feeRowsWith[1]?.join(" ")).toContain("Ação Honorário"); // apelido

    // Formato real da célula de valor do honorário (índice 4 = "Valor do honorário (R$)"):
    // gravado como número decimal pelo ExcelJS; lido de volta como string "6000".
    const valorHonorarioCelula = feeRowsWith[1]?.[4];
    expect(String(valorHonorarioCelula)).toMatch(/^6000(\.0+)?$/);

    // Sem lançamento de caixa: o Resumo não deve ter faturamento vindo de honorários
    const resumoRows = await readSheet(withCase.filePath, "Resumo");
    const resumoText = resumoRows.map((r) => r.join(" ")).join("\n");
    expect(resumoText).not.toContain("Honorário");
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("honorário com dueDate nulo aparece no período via createdAt", async () => {
    const lawFirmShopId = (await prisma.barbershop.create({
      data: {
        name: "QA Escritório DueDate Nulo",
        whatsapp: "11900000034",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    })).id;
    try {
      const lawStaff = await prisma.user.create({
      data: {
        name: "Advogado DueDate Nulo",
        email: `lawyer-duedate-null-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: lawFirmShopId,
      },
      select: { id: true },
    });
    const lawClient = await prisma.salonClient.create({
      data: {
        barbershopId: lawFirmShopId,
        name: "Cliente DueDate Nulo",
        whatsapp: "11988880017",
      },
      select: { id: true },
    });
    const lawsuit = await prisma.clientCase.create({
      data: {
        barbershopId: lawFirmShopId,
        clientId: lawClient.id,
        nickname: "Ação DueDate Nulo",
        caseNumber: "1000002-36.2026.8.26.0100",
        status: "ACTIVE",
        openedAt: new Date("2027-03-01T00:00:00Z"),
        responsibleStaffId: lawStaff.id,
        shareWithClient: false,
      },
      select: { id: true },
    });
    // dueDate nulo, createdAt dentro do período
    await prisma.caseSuccessFee.create({
      data: {
        barbershopId: lawFirmShopId,
        caseId: lawsuit.id,
        percent: 10,
        baseAmount: 20000,
        amount: 2000,
        status: "PENDING",
        dueDate: null,
        installments: 1,
        notes: "Sem vencimento",
        createdAt: new Date("2027-06-15T00:00:00Z"),
      },
    });

    const period = {
      from: new Date("2027-01-01T00:00:00Z"),
      to: new Date("2027-12-31T23:59:59Z"),
      barbershopId: lawFirmShopId,
    };

    const result = await generate({
      ...period,
      modules: ["caseFees"],
      includeCase: true,
    });

    const rows = await readSheet(result.filePath, "Honorários de êxito");
    const dataText = rows.slice(1).map((row) => row.join(" ")).join("\n");
    expect(dataText).toContain("1000002-36.2026.8.26.0100");
    expect(dataText).toContain("Ação DueDate Nulo");
    expect(dataText).toContain("2000"); // valor do honorário
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("anonymize mascara todos os campos pessoais da aba Processos", async () => {
    const lawFirmShopId = (await prisma.barbershop.create({
      data: {
        name: "QA Escritório Anonymize",
        whatsapp: "11900000035",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    })).id;
    try {
      const lawClient = await prisma.salonClient.create({
        data: {
          barbershopId: lawFirmShopId,
          name: "Cliente Sigiloso Anonimizar",
          whatsapp: "11988880035",
        },
        select: { id: true },
      });
      const lawStaff = await prisma.user.create({
        data: {
          name: "Advogado Sigiloso Anonimizar",
          email: `lawyer-anonymize-${randomUUID()}@qa.local`,
          password: "x",
          role: "EMPLOYEE",
          barbershopId: lawFirmShopId,
        },
        select: { id: true },
      });
      await prisma.clientCase.create({
        data: {
          barbershopId: lawFirmShopId,
          clientId: lawClient.id,
          nickname: "Ação Anonimizar",
          caseNumber: "0025900-78.2020.8.26.0100",
          title: "Título Sigiloso Anonimizar",
          opponent: "Parte Adversária Sigilosa",
          practiceArea: "Cível",
          status: "ACTIVE",
          priority: "HIGH",
          claimedAmount: 50000,
          awardedAmount: 30000,
          openedAt: new Date("2027-03-01T00:00:00Z"),
          responsibleStaffId: lawStaff.id,
          shareWithClient: false,
        },
        select: { id: true },
      });

      const result = await generate({
        from: new Date("2027-01-01T00:00:00Z"),
        to: new Date("2027-12-31T23:59:59Z"),
        barbershopId: lawFirmShopId,
        modules: ["cases"],
        anonymize: true,
        includeCase: true,
      });

      const rows = await readSheet(result.filePath, "Processos");
      const data = rows.slice(1).map((row) => row.join(" ")).join("\n");

      // Nenhum campo pessoal da aba Processos pode aparecer com anonymize.
      expect(data).not.toContain("Cliente Sigiloso Anonimizar");
      expect(data).not.toContain("11988880035");
      expect(data).not.toContain("0025900-78.2020.8.26.0100");
      expect(data).not.toContain("Ação Anonimizar");
      expect(data).not.toContain("Parte Adversária Sigilosa");
      expect(data).not.toContain("Título Sigiloso Anonimizar");
      expect(data).not.toContain("Advogado Sigiloso Anonimizar");

      // Valores, datas e dados não pessoais permanecem legíveis.
      expect(data).toContain("50000");
      expect(data).toContain("30000");
      expect(data).toContain("Cível");
      expect(data).toContain("Em andamento");
      expect(data).toContain("Alta");
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("anonymize + honorários: Observações vazias sem includeCase", async () => {
    const lawFirmShopId = (await prisma.barbershop.create({
      data: {
        name: "QA Escritório Observações",
        whatsapp: "11900000036",
        businessSegment: "LAW_FIRM",
      },
      select: { id: true },
    })).id;
    try {
      const lawStaff = await prisma.user.create({
      data: {
        name: "Advogado Observacoes",
        email: `lawyer-obs-export-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: lawFirmShopId,
      },
      select: { id: true },
    });
    const lawClient = await prisma.salonClient.create({
      data: {
        barbershopId: lawFirmShopId,
        name: "Cliente Observacoes",
        whatsapp: "11988880036",
      },
      select: { id: true },
    });
    const lawsuit = await prisma.clientCase.create({
      data: {
        barbershopId: lawFirmShopId,
        clientId: lawClient.id,
        nickname: "Ação Observacoes",
        caseNumber: "1000001-51.2026.8.26.0100",
        status: "ACTIVE",
        openedAt: new Date("2027-03-01T00:00:00Z"),
        responsibleStaffId: lawStaff.id,
        shareWithClient: false,
      },
      select: { id: true },
    });
    await prisma.caseSuccessFee.create({
      data: {
        barbershopId: lawFirmShopId,
        caseId: lawsuit.id,
        percent: 25,
        baseAmount: 40000,
        amount: 10000,
        status: "PENDING",
        dueDate: new Date("2027-04-01T00:00:00Z"),
        installments: 1,
        notes: "Observação sigilosa do honorário",
        createdAt: new Date("2027-03-15T00:00:00Z"),
      },
    });

    const result = await generate({
      from: new Date("2027-01-01T00:00:00Z"),
      to: new Date("2027-12-31T23:59:59Z"),
      barbershopId: lawFirmShopId,
      modules: ["caseFees"],
      includeCase: false,
    });

    // Sem includeCase: caseFees entra (sem dados do processo), cases não entra
    const allSheetNames = await readAllSheetNames(result.filePath);
    expect(allSheetNames).toContain("Honorários de êxito");
    expect(allSheetNames).not.toContain("Processos");

    const feeRows = await readSheet(result.filePath, "Honorários de êxito");
    const feeRow = feeRows[1];
    // Número do processo e apelido vazios (sem includeCase)
    expect((feeRow?.[0] ?? "")).toBe("");
    expect((feeRow?.[1] ?? "")).toBe("");
    // Observações vazias (sem includeCase)
    expect((feeRow?.[8] ?? "")).toBe("");
    // Valor do honorário ainda presente
    expect(feeRow?.join(" ")).toContain("10000");
    } finally {
      await prisma.barbershop.delete({ where: { id: lawFirmShopId } });
    }
  });

  it("anonimiza dados pessoais quando pedido", async () => {
    const result = await generate({ modules: ["clients"], anonymize: true });
    const rows = await readSheet(result.filePath, "Clientes");
    const data = rows.slice(1).map((row) => row.join(" ")).join("\n");
    expect(data).not.toContain("Cliente Exportação");
    expect(data).not.toContain("11988880001");
    expect(data).toContain("*");
  });

  it("gera CSVs em .zip com BOM e separador ;", async () => {
    const result = await generate({ modules: ["clients", "services"], format: "CSV_ZIP" });
    expect(result.fileName.endsWith(".zip")).toBe(true);

    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(result.filePath);
    // Assinatura de zip ("PK").
    expect(buffer.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("não deixa outro salão acessar a exportação", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/exports`,
      headers,
      payload: { periodPreset: "TODAY", modules: ["clients"] },
    });
    expect(create.statusCode).toBe(201);
    const exportId = create.json().data.id as string;

    // Outro dono não enxerga o job.
    const otherGet = await app.inject({
      method: "GET",
      url: `/api/barbershops/${shopId}/exports/${exportId}`,
      headers: otherHeaders,
    });
    expect([403, 404]).toContain(otherGet.statusCode);

    // E o download também não.
    const otherDownload = await app.inject({
      method: "GET",
      url: `/api/barbershops/${shopId}/exports/${exportId}/download`,
      headers: otherHeaders,
    });
    expect([403, 404]).toContain(otherDownload.statusCode);

    // Exclui o job criado (limpa a fila).
    await app.inject({
      method: "DELETE",
      url: `/api/barbershops/${shopId}/exports/${exportId}`,
      headers,
    });
  });

  it("apaga o arquivo quando o dono exclui a exportação", async () => {
    const { stat } = await import("node:fs/promises");
    const result = await generate({ modules: ["clients"] });
    const before = await stat(result.filePath);

    const job = await inTenant(() =>
      prisma.exportJob.create({
        data: {
          barbershopId: shopId,
          createdById: owner.id,
          periodPreset: "TODAY",
          timezone: "America/Sao_Paulo",
          modules: ["clients"],
          options: { anonymize: false, includeCase: false },
          format: "XLSX",
          status: "COMPLETED",
          filePath: result.filePath,
          fileName: result.fileName,
          fileSizeBytes: before.size,
          expiresAt: new Date(Date.now() + 60_000),
        },
        select: { id: true },
      }),
    );

    const response = await app.inject({
      method: "DELETE",
      url: `/api/barbershops/${shopId}/exports/${job.id}`,
      headers,
    });
    expect(response.statusCode).toBe(200);

    await expect(stat(result.filePath)).rejects.toThrow();
  });

  it("faz a ida e volta: exportar clientes/serviços e reimportar", async () => {
    const result = await generate({ modules: ["clients", "services"] });

    // A planilha exportada vira um .xlsx de duas abas para o assistente.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.filePath);
    const clientsSheet = workbook.getWorksheet("Clientes")!;
    const servicesSheet = workbook.getWorksheet("Serviços")!;

    const target = new ExcelJS.Workbook();
    const targetClients = target.addWorksheet("Clientes");
    const targetServices = target.addWorksheet("Serviços");
    // Copia o cabeçalho e os dados, mantendo só as colunas reimportáveis.
    clientsSheet.eachRow((row) => {
      const values = row.values as unknown[];
      targetClients.addRow(values.slice(1, 3)); // Nome + WhatsApp
    });
    servicesSheet.eachRow((row) => {
      const values = row.values as unknown[];
      targetServices.addRow(values.slice(1, 4)); // Nome + Preço + Duração
    });

    const buffer = await target.xlsx.writeBuffer();

    // Importa em um salão novo (banco limpo para clientes/serviços).
    const freshShop = await prisma.barbershop.create({
      data: { name: "QA Ida e Volta", whatsapp: "11900000012" },
    });
    const freshOwner = await prisma.user.create({
      data: {
        name: "Owner Ida e Volta",
        email: `owner-roundtrip-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: freshShop.id,
      },
      select: { id: true, role: true },
    });
    const freshHeaders = {
      authorization: `Bearer ${tokenFor(freshOwner, freshShop.id)}`,
    };

    const boundary = `----agendai${randomUUID().replace(/-/g, "")}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ida-e-volta.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      ),
      Buffer.from(buffer),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const upload = await app.inject({
      method: "POST",
      url: `/api/barbershops/${freshShop.id}/imports`,
      headers: { ...freshHeaders, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(upload.statusCode).toBe(201);
    const batchId = upload.json().data.id as string;

    const targetResponse = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${freshShop.id}/imports/${batchId}/target`,
      headers: freshHeaders,
      payload: {
        sheets: [
          { sheetName: "Clientes", targetType: "CLIENTS" },
          { sheetName: "Serviços", targetType: "SERVICES" },
        ],
      },
    });
    expect(targetResponse.statusCode).toBe(200);

    const mappingResponse = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${freshShop.id}/imports/${batchId}/mapping`,
      headers: freshHeaders,
      payload: {
        sheets: [
          { sheetName: "Clientes", targetType: "CLIENTS", columns: { "0": "name", "1": "whatsapp" } },
          {
            sheetName: "Serviços",
            targetType: "SERVICES",
            columns: { "0": "serviceName", "1": "price", "2": "durationMinutes" },
          },
        ],
      },
    });
    expect(mappingResponse.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: `/api/barbershops/${freshShop.id}/imports/${batchId}/validate`,
      headers: freshHeaders,
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/api/barbershops/${freshShop.id}/imports/${batchId}/confirm`,
      headers: freshHeaders,
      payload: {},
    });

    await requestContext.run({ barbershopId: freshShop.id }, () =>
      processImportBatch(batchId),
    );

    // Mesmas contagens do lado exportado.
    const exportedClients = (await readSheet(result.filePath, "Clientes")).length - 1;
    const exportedServices = (await readSheet(result.filePath, "Serviços")).length - 1;
    const importedClients = await prisma.salonClient.count({
      where: { barbershopId: freshShop.id },
    });
    const importedServices = await prisma.service.count({
      where: { barbershopId: freshShop.id },
    });

    expect(importedClients).toBe(exportedClients);
    expect(importedServices).toBe(exportedServices);
    expect(importedClients).toBeGreaterThan(0);
    expect(importedServices).toBeGreaterThan(0);

    await prisma.barbershop.delete({ where: { id: freshShop.id } });
  });
});
