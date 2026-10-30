/// <reference types="vitest/globals" />
/**
 * Integração (Postgres real no :5442): assistente de importação de planilhas.
 *
 * Cobre o fluxo inteiro do dono — upload → mapeamento → dry-run → confirmar →
 * processar — e as três garantias que sustentam o produto:
 *
 *   1. a importação é **silenciosa**: nenhuma mensagem, convite de avaliação,
 *      comissão ou lançamento financeiro é criado;
 *   2. reimportar o mesmo arquivo **não duplica** cliente nem agenda;
 *   3. desfazer remove **só o que o lote criou** (por tipo, inclusive em
 *      planilha multi-aba).
 */
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import ExcelJS from "exceljs";
import auth from "@/config/auth";
import type { FastifyInstance } from "fastify";
import {
  startPostgresHarness,
  type PostgresHarness,
} from "../helpers/postgres";
import { prisma } from "@/libs/prismaClient";
import { requestContext } from "@/shared/infra/http/requestContext";
import { processImportBatch } from "@/modules/dataImport/importProcessor";

const CSV_CLIENTES = [
  "Nome;WhatsApp;Observações",
  "Ana Importada;11987650001;cliente da planilha",
  "Bruno Importado;11987650002;",
  "Carla Importada;11987650003;",
].join("\n");

const CSV_CLIENTES_DESFAZER = [
  "Nome;WhatsApp;Observações",
  "Ana Desfazida;11987660001;",
  "Bruno Desfeito;11987660002;",
  "Carla Desfeita;11987660003;",
].join("\n");

const CSV_AGENDAMENTOS = [
  "Data;Hora;Cliente;WhatsApp;Serviço;Profissional;Situação",
  "05/11/2026;14:30;Ana Importada;11987650001;Corte Teste;João;Concluído",
  "06/11/2026;10:00;Bruno Importado;11987650002;Corte Teste;João;Confirmado",
].join("\n");

describe("importação de planilhas — fluxo completo no banco real", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;

  let shopId: string;
  let owner: { id: string; role: string };
  let headers: Record<string, string>;
  let pendingBatches: string[] = [];

  function tokenFor(user: { id: string; role: string }): string {
    return sign(
      { role: user.role, barbershopId: shopId },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "1h" },
    );
  }

  /** Consulta dentro do contexto do salão: a RLS do banco filtra por tenant. */
  function inTenant<T>(fn: () => Promise<T>): Promise<T> {
    return requestContext.run({ barbershopId: shopId }, fn);
  }

  function multipart(fileName: string, content: string | Buffer) {
    const boundary = `----agendai${randomUUID().replace(/-/g, "")}`;
    const payload = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const fileContentType = fileName.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${fileContentType}\r\n\r\n`,
      ),
      payload,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return {
      body,
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  async function upload(fileName: string, content: string | Buffer): Promise<string> {
    const { body, contentType } = multipart(fileName, content);
    const response = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/imports`,
      headers: { ...headers, "content-type": contentType },
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    const batchId = response.json().data.id as string;
    pendingBatches.push(batchId);
    return batchId;
  }

  async function configureTarget(batchId: string, targetType: string): Promise<void> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${shopId}/imports/${batchId}/target`,
      headers,
      payload: { targetType, sheetName: null },
    });
    expect(response.statusCode).toBe(200);
  }

  /** Forma multi-aba do PATCH /target: uma escolha por aba. */
  async function configureTargets(
    batchId: string,
    sheets: Array<{ sheetName: string | null; targetType: string }>,
  ): Promise<{ targetType: string; sheets: Array<{ sheetName: string | null }> }> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${shopId}/imports/${batchId}/target`,
      headers,
      payload: { sheets },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data;
  }

  async function saveMapping(
    batchId: string,
    columns: Record<string, string>,
  ): Promise<void> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${shopId}/imports/${batchId}/mapping`,
      headers,
      payload: {
        columns,
        options: {
          updateExisting: true,
          countFinancialValues: false,
          sendReviewInvitations: false,
          includeCase: false,
        },
      },
    });
    expect(response.statusCode).toBe(200);
  }

  /** Forma multi-aba do PATCH /mapping: uma entrada por aba. */
  async function saveMappingSheets(
    batchId: string,
    sheets: Array<{
      sheetName: string | null;
      targetType: string;
      columns: Record<string, string>;
      options?: Record<string, boolean>;
    }>,
  ): Promise<void> {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/barbershops/${shopId}/imports/${batchId}/mapping`,
      headers,
      payload: { sheets },
    });
    expect(response.statusCode).toBe(200);
  }

  async function validate(batchId: string) {
    const response = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/imports/${batchId}/validate`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    return response.json().data as {
      totalRows: number;
      validRows: number;
      skippedRows: number;
      failedRows: number;
    };
  }

  async function confirm(batchId: string): Promise<void> {
    const response = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/imports/${batchId}/confirm`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
  }

  /** O worker da fila é o mesmo código do processo: aqui rodamos direto. */
  async function process(batchId: string) {
    return inTenant(() => processImportBatch(batchId));
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();

    const shop = await prisma.barbershop.create({
      data: { name: "QA Importação", whatsapp: "11900000009" },
    });
    shopId = shop.id;
    owner = await prisma.user.create({
      data: {
        name: "Owner Importação",
        email: `owner-import-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopId,
      },
      select: { id: true, role: true },
    });
    headers = { authorization: `Bearer ${tokenFor(owner)}` };

    await prisma.service.create({
      data: {
        barbershopId: shopId,
        name: "Corte Teste",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
      },
    });
  }, 180_000);

  afterEach(async () => {
    // O salão aceita uma importação ativa por vez: cada teste fecha o seu lote.
    for (const batchId of pendingBatches) {
      await app.inject({
        method: "POST",
        url: `/api/barbershops/${shopId}/imports/${batchId}/cancel`,
        headers,
        payload: {},
      });
    }
    pendingBatches = [];
    await inTenant(() =>
      prisma.importBatch.deleteMany({ where: { barbershopId: shopId } }),
    );
  });

  afterAll(async () => {
    try {
      if (shopId) {
        await prisma.barbershop.deleteMany({ where: { id: shopId } });
      }
    } catch {
      /* limpeza best-effort */
    }
    if (app && closeTestApp) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("upload → mapeamento → dry-run não grava nada no banco", async () => {
    const batchId = await upload("clientes.csv", CSV_CLIENTES);
    await configureTarget(batchId, "CLIENTS");

    const clientsBefore = await inTenant(() =>
      prisma.salonClient.count({ where: { barbershopId: shopId } }),
    );

    await saveMapping(batchId, { "0": "name", "1": "whatsapp", "2": "notes" });
    const summary = await validate(batchId);

    expect(summary.totalRows).toBe(3);
    expect(summary.validRows).toBe(3);
    expect(summary.failedRows).toBe(0);

    const clientsAfter = await inTenant(() =>
      prisma.salonClient.count({ where: { barbershopId: shopId } }),
    );
    expect(clientsAfter).toBe(clientsBefore);
  });

  it("confirmar processa o lote sem notificar, convidar, comissionar nem lançar no caixa", async () => {
    const batchId = await upload("clientes.csv", CSV_CLIENTES);
    await configureTarget(batchId, "CLIENTS");
    await saveMapping(batchId, { "0": "name", "1": "whatsapp", "2": "notes" });
    await validate(batchId);
    await confirm(batchId);

    const result = await process(batchId);
    expect(result.importedRows).toBe(3);
    expect(result.failedRows).toBe(0);

    const clients = await inTenant(() =>
      prisma.salonClient.findMany({
        where: { barbershopId: shopId, normalizedWhatsapp: { startsWith: "1198765" } },
        select: { id: true, name: true, marketingOptIn: true },
      }),
    );
    expect(clients).toHaveLength(3);
    expect(clients.every((client) => client.marketingOptIn === false)).toBe(true);

    // Nenhum efeito colateral: sem mensagem, sem avaliação, sem comissão,
    // sem lançamento financeiro e sem e-mail na fila.
    const efeitos = await inTenant(async () => ({
      notifications: await prisma.notificationDelivery.count({ where: { barbershopId: shopId } }),
      outbox: await prisma.notificationOutbox.count(),
      emails: await prisma.emailDelivery.count(),
      reviews: await prisma.reviewInvitation.count({ where: { barbershopId: shopId } }),
      nps: await prisma.npsSurvey.count({ where: { barbershopId: shopId } }),
      comissoes: await prisma.commissionEntry.count({ where: { barbershopId: shopId } }),
      crm: await prisma.crmFinancialEvent.count({ where: { barbershopId: shopId } }),
      caixa: await prisma.cashMovement.count({ where: { barbershopId: shopId } }),
      fiado: await prisma.fiado.count({ where: { barbershopId: shopId } }),
    }));
    expect(efeitos).toEqual({
      notifications: 0,
      outbox: 0,
      emails: 0,
      reviews: 0,
      nps: 0,
      comissoes: 0,
      crm: 0,
      caixa: 0,
      fiado: 0,
    });
  });

  it("importar a agenda atualiza os contadores de CRM sem virar receita", async () => {
    const batchId = await upload("agendamentos.csv", CSV_AGENDAMENTOS);
    await configureTarget(batchId, "APPOINTMENTS");
    await saveMapping(batchId, {
      "0": "date",
      "1": "time",
      "2": "clientName",
      "3": "clientWhatsapp",
      "4": "serviceName",
      "5": "staffName",
      "6": "status",
    });
    await validate(batchId);
    await confirm(batchId);

    const result = await process(batchId);
    expect(result.importedRows).toBe(2);

    const appointments = await inTenant(() =>
      prisma.appointment.findMany({
        where: { barbershopId: shopId, source: "IMPORT" },
        select: { id: true, clientId: true, status: true, completedAt: true },
      }),
    );
    expect(appointments).toHaveLength(2);

    // O atendimento concluído vira visita; o confirmado é só roteiro.
    const ana = await inTenant(() =>
      prisma.salonClient.findFirst({
        where: { barbershopId: shopId, normalizedWhatsapp: "11987650001" },
        select: { totalAppointments: true, lastVisitAt: true },
      }),
    );
    expect(ana?.totalAppointments).toBe(1);
    expect(ana?.lastVisitAt).toEqual(new Date("2026-11-05T00:00:00.000Z"));

    const bruno = await inTenant(() =>
      prisma.salonClient.findFirst({
        where: { barbershopId: shopId, normalizedWhatsapp: "11987650002" },
        select: { totalAppointments: true, lastVisitAt: true },
      }),
    );
    expect(bruno?.totalAppointments).toBe(1);
    expect(bruno?.lastVisitAt).toBeNull();

    // Sem receita: o histórico financeiro continua vazio.
    const receita = await inTenant(async () => ({
      crm: await prisma.crmFinancialEvent.count({ where: { barbershopId: shopId } }),
      comissoes: await prisma.commissionEntry.count({ where: { barbershopId: shopId } }),
      concluidos: await prisma.appointment.count({
        where: { barbershopId: shopId, completedAt: { not: null } },
      }),
    }));
    expect(receita).toEqual({ crm: 0, comissoes: 0, concluidos: 0 });
  });

  it("reimportar o mesmo arquivo não duplica cliente nem agenda", async () => {
    const clientsBefore = await inTenant(() =>
      prisma.salonClient.count({ where: { barbershopId: shopId } }),
    );
    const appointmentsBefore = await inTenant(() =>
      prisma.appointment.count({ where: { barbershopId: shopId } }),
    );

    const batchId = await upload("agendamentos.csv", CSV_AGENDAMENTOS);
    await configureTarget(batchId, "APPOINTMENTS");
    await saveMapping(batchId, {
      "0": "date",
      "1": "time",
      "2": "clientName",
      "3": "clientWhatsapp",
      "4": "serviceName",
      "5": "staffName",
      "6": "status",
    });
    await validate(batchId);
    await confirm(batchId);

    const result = await process(batchId);
    expect(result.importedRows).toBe(0);
    expect(result.skippedRows).toBe(2);

    expect(
      await inTenant(() => prisma.salonClient.count({ where: { barbershopId: shopId } })),
    ).toBe(clientsBefore);
    expect(
      await inTenant(() => prisma.appointment.count({ where: { barbershopId: shopId } })),
    ).toBe(appointmentsBefore);
  });

  it("desfazer remove só o que o lote criou", async () => {
    const preexisting = await prisma.salonClient.create({
      data: {
        barbershopId: shopId,
        name: "Cliente Nato",
        whatsapp: "11987770000",
        normalizedWhatsapp: "11987770000",
      },
      select: { id: true },
    });

    const batchId = await upload("clientes-desfazer.csv", CSV_CLIENTES_DESFAZER);
    await configureTarget(batchId, "CLIENTS");
    await saveMapping(batchId, { "0": "name", "1": "whatsapp", "2": "notes" });
    await validate(batchId);
    await confirm(batchId);
    await process(batchId);

    const importedBefore = await inTenant(() =>
      prisma.salonClient.count({
        where: { barbershopId: shopId, normalizedWhatsapp: { startsWith: "1198766" } },
      }),
    );
    expect(importedBefore).toBe(3);

    const response = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/imports/${batchId}/undo`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);

    const importedAfter = await inTenant(() =>
      prisma.salonClient.count({
        where: { barbershopId: shopId, normalizedWhatsapp: { startsWith: "1198766" } },
      }),
    );
    expect(importedAfter).toBe(0);

    // O cliente que já existia continua no banco.
    const stillThere = await prisma.salonClient.findUnique({
      where: { id: preexisting.id },
      select: { id: true },
    });
    expect(stillThere).not.toBeNull();
  });

  it("planilha multi-aba importa cada aba no seu tipo e o desfazer remove tudo", async () => {
    const xlsx = await buildMultiSheetXlsx([
      {
        name: "Clientes",
        headers: ["Nome", "WhatsApp"],
        rows: [
          ["Multi Ana", "11987680001"],
          ["Multi Bruno", "11987680002"],
        ],
      },
      {
        name: "Produtos",
        headers: ["Produto", "Preço", "Estoque"],
        rows: [
          ["Shampoo Multi", "29.90", "10"],
          ["Condicionador Multi", "24.50", "5"],
        ],
      },
    ]);

    const batchId = await upload("multi.xlsx", xlsx);
    const configured = await configureTargets(batchId, [
      { sheetName: "Clientes", targetType: "CLIENTS" },
      { sheetName: "Produtos", targetType: "PRODUCTS" },
    ]);

    // O lote guarda o tipo misto e devolve uma view por aba.
    expect(configured.targetType).toBe("MIXED");
    expect(configured.sheets).toHaveLength(2);

    await saveMappingSheets(batchId, [
      {
        sheetName: "Clientes",
        targetType: "CLIENTS",
        columns: { "0": "name", "1": "whatsapp" },
      },
      {
        sheetName: "Produtos",
        targetType: "PRODUCTS",
        columns: { "0": "productName", "1": "salePrice", "2": "stockQty" },
      },
    ]);

    const summary = await validate(batchId);
    expect(summary.totalRows).toBe(4);
    expect(summary.validRows).toBe(4);
    expect(summary.failedRows).toBe(0);

    await confirm(batchId);
    const result = await process(batchId);
    expect(result.importedRows).toBe(4);
    expect(result.failedRows).toBe(0);

    const clients = await inTenant(() =>
      prisma.salonClient.count({
        where: { barbershopId: shopId, normalizedWhatsapp: { startsWith: "1198768" } },
      }),
    );
    expect(clients).toBe(2);

    const products = await inTenant(() =>
      prisma.product.count({
        where: { barbershopId: shopId, name: { contains: "Multi" } },
      }),
    );
    expect(products).toBe(2);

    // Estoque inicial vira movimento de entrada (não sobrescreve direto).
    const movements = await inTenant(() =>
      prisma.stockMovement.count({
        where: { barbershopId: shopId, type: "IMPORT" },
      }),
    );
    expect(movements).toBe(2);

    // Sem efeito colateral financeiro.
    const financeiro = await inTenant(async () => ({
      caixa: await prisma.cashMovement.count({ where: { barbershopId: shopId } }),
      crm: await prisma.crmFinancialEvent.count({ where: { barbershopId: shopId } }),
    }));
    expect(financeiro).toEqual({ caixa: 0, crm: 0 });

    // Desfazer multi-tipo: remove clientes E produtos (e movimentos IMPORT).
    const undoResponse = await app.inject({
      method: "POST",
      url: `/api/barbershops/${shopId}/imports/${batchId}/undo`,
      headers,
      payload: {},
    });
    expect(undoResponse.statusCode).toBe(200);
    const undo = undoResponse.json().data as { removed: number; details: Array<{ entityType: string }> };
    expect(undo.removed).toBe(4);
    expect(new Set(undo.details.map((d) => d.entityType))).toEqual(
      new Set(["CLIENT", "PRODUCT"]),
    );

    expect(
      await inTenant(() =>
        prisma.salonClient.count({
          where: { barbershopId: shopId, normalizedWhatsapp: { startsWith: "1198768" } },
        }),
      ),
    ).toBe(0);
    expect(
      await inTenant(() =>
        prisma.product.count({
          where: { barbershopId: shopId, name: { contains: "Multi" } },
        }),
      ),
    ).toBe(0);
    expect(
      await inTenant(() =>
        prisma.stockMovement.count({
          where: { barbershopId: shopId, type: "IMPORT" },
        }),
      ),
    ).toBe(0);
  });

  it("planilha multi-aba processa as abas na ordem de dependência", async () => {
    // Serviços e clientes na MESMA planilha: mesmo que o dono escolha
    // Clientes primeiro, o serviço é criado antes (a agenda depende dele).
    const xlsx = await buildMultiSheetXlsx([
      {
        name: "Clientes",
        headers: ["Nome", "WhatsApp"],
        rows: [["Ordem Ana", "11987690001"]],
      },
      {
        name: "Serviços",
        headers: ["Serviço", "Preço", "Duração"],
        rows: [["Serviço Ordem", "40", "45"]],
      },
    ]);

    const batchId = await upload("ordem.xlsx", xlsx);
    await configureTargets(batchId, [
      { sheetName: "Clientes", targetType: "CLIENTS" },
      { sheetName: "Serviços", targetType: "SERVICES" },
    ]);
    await saveMappingSheets(batchId, [
      {
        sheetName: "Clientes",
        targetType: "CLIENTS",
        columns: { "0": "name", "1": "whatsapp" },
      },
      {
        sheetName: "Serviços",
        targetType: "SERVICES",
        columns: { "0": "serviceName", "1": "price", "2": "durationMinutes" },
      },
    ]);
    await validate(batchId);
    await confirm(batchId);
    const result = await process(batchId);
    expect(result.importedRows).toBe(2);

    const service = await inTenant(() =>
      prisma.service.findFirst({
        where: { barbershopId: shopId, name: "Serviço Ordem" },
        select: { id: true },
      }),
    );
    expect(service).not.toBeNull();

    const client = await inTenant(() =>
      prisma.salonClient.findFirst({
        where: { barbershopId: shopId, normalizedWhatsapp: "11987690001" },
        select: { id: true },
      }),
    );
    expect(client).not.toBeNull();
  });
});

/** Monta um .xlsx multi-aba em memória (mesmo parser do assistente lê). */
async function buildMultiSheetXlsx(
  sheets: Array<{ name: string; headers: string[]; rows: string[][] }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow(sheet.headers);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
