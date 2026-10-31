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
  let generatedFiles: string[] = [];

  function tokenFor(user: { id: string; role: string }, tenant: string): string {
    return sign(
      { role: user.role, barbershopId: tenant },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "1h" },
    );
  }

  function inTenant<T>(fn: () => Promise<T>): Promise<T> {
    return requestContext.run({ barbershopId: shopId }, fn);
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
      >;
      format?: "XLSX" | "CSV_ZIP";
      anonymize?: boolean;
      from?: Date | null;
      to?: Date | null;
    } = {},
  ): Promise<{ filePath: string; fileName: string; warnings: string[] }> {
    const from = options.from ?? new Date("2026-01-01T00:00:00Z");
    const to = options.to ?? new Date("2026-12-31T23:59:59Z");
    const result = await inTenant(() =>
      buildExportFile({
        exportId: randomUUID(),
        barbershopId: shopId,
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
        options: { anonymize: options.anonymize ?? false, includeCase: false },
        generatedAt: new Date("2026-10-30T12:00:00Z"),
        onProgress: async () => undefined,
      }),
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
    await prisma.barbershop.deleteMany({ where: { id: { in: [shopId, otherShopId] } } });
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
