/// <reference types="vitest/globals" />
/**
 * E2E do atendente de IA no WhatsApp — sem mocks.
 *
 * O que é real aqui:
 * - Postgres real (harness em `src/tests/helpers/postgres.ts`);
 * - repositório real (`WhatsAppAiRepository` sobre o Prisma);
 * - store real (Redis, com fallback em memória);
 * - envio real para uma Evolution API falsa: um servidor HTTP local que
 *   recebe `POST /message/sendText/{instance}` e guarda o que foi enviado;
 * - app Fastify real (`createTestApp`) para o nível HTTP do webhook.
 *
 * Requer Postgres local (docker compose, porta 5442) — o script
 * `npm run test:integration` já aponta o DATABASE_URL para ele.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { sign } from "jsonwebtoken";
import { prisma } from "@/libs/prismaClient";
import { startPostgresHarness } from "../helpers/postgres";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";
import { WhatsAppAiService } from "@/modules/whatsappAi/whatsappAiService";
import { WhatsAppAiRepository } from "@/modules/whatsappAi/whatsappAiRepository";
import auth from "@/config/auth";

const AI_INSTANCE = "agendai-ia-test";
const WEBHOOK_SECRET = "a".repeat(40);

type SentMessage = { instance: string; number: string; text: string };

const sentMessages: SentMessage[] = [];
let fakeEvolution: Server;
let fakeEvolutionUrl: string;

/** Evolution API falsa: registra os textos enviados pelo atendente. */
async function startFakeEvolution(): Promise<void> {
  fakeEvolution = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let payload: { number?: string; text?: string } = {};
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = {};
      }
      const match = req.url?.match(/^\/message\/sendText\/([^?]+)/);
      sentMessages.push({
        instance: match ? decodeURIComponent(match[1]) : "",
        number: payload.number ?? "",
        text: payload.text ?? "",
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ key: { id: `fake-${sentMessages.length}` } }));
    });
  });

  await new Promise<void>(resolve => fakeEvolution.listen(0, "127.0.0.1", resolve));
  const address = fakeEvolution.address() as AddressInfo;
  fakeEvolutionUrl = `http://127.0.0.1:${address.port}`;
}

async function stopFakeEvolution(): Promise<void> {
  if (!fakeEvolution) return;
  await new Promise<void>(resolve => fakeEvolution.close(() => resolve()));
}

const shopIds: string[] = [];
const userIds: string[] = [];
const identityIds: string[] = [];

async function createShop(label: string, overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  shopIds.push(id);
  await prisma.barbershop.create({
    data: {
      id,
      name: `[QA-AI] ${label}`,
      whatsapp: "11988887777",
      address: `Rua ${label}, 321`,
      city: "São Paulo",
      approvalStatus: "APPROVED",
      active: true,
      whatsappAiEnabled: true,
      schedules: {
        create: [
          { dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "19:00" },
          { dayOfWeek: 2, isOpen: true, openTime: "09:00", closeTime: "19:00" },
        ],
      },
      services: {
        create: [
          { name: "Corte", price: 40, avgTimeMinutes: 30, icon: "scissors" },
          { name: "Barba", price: 30, avgTimeMinutes: 20, icon: "razor" },
        ],
      },
      ...overrides,
    },
  });
  return id;
}

async function createOwner(barbershopId: string) {
  const id = randomUUID();
  userIds.push(id);
  await prisma.user.create({
    data: {
      id,
      name: `[QA-AI] Dono ${barbershopId.slice(0, 6)}`,
      email: `qa-ai-${id}@example.com`,
      password: "hash-fake-para-teste-de-integracao",
      role: "OWNER",
      barbershopId,
      active: true,
    },
  });
  return id;
}

function ownerToken(userId: string, barbershopId: string): string {
  return sign({ sub: userId, role: "OWNER", barbershopId }, auth.secret, { expiresIn: "1h" });
}

describe("atendente de IA no WhatsApp (E2E real)", () => {
  let harness: Awaited<ReturnType<typeof startPostgresHarness>>;
  let shopA: string;
  let shopB: string;
  let shopDisabled: string;
  let ownerAId: string;

  const service = new WhatsAppAiService();
  const repo = new WhatsAppAiRepository();

  beforeAll(async () => {
    harness = await startPostgresHarness();

    await startFakeEvolution();
    process.env.EVOLUTION_API_URL = fakeEvolutionUrl;
    process.env.EVOLUTION_API_KEY = "fake-api-key";
    process.env.EVOLUTION_AI_INSTANCE_NAME = AI_INSTANCE;
    process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
    // O store do atendente usa o Redis de verdade (com queda para memória).
    process.env.ALLOW_TEST_REDIS = "1";

    shopA = await createShop("Unidade A");
    shopB = await createShop("Unidade B");
    shopDisabled = await createShop("Desligado", { whatsappAiEnabled: false });
    ownerAId = await createOwner(shopA);

    // Cliente de duas unidades (portal do cliente) — o número define o salão.
    const identityId = randomUUID();
    identityIds.push(identityId);
    await prisma.clientIdentity.create({
      data: {
        id: identityId,
        name: "[QA-AI] Cliente Multi",
        phone: "5511999990000",
        normalizedPhone: "5511999990000",
        phoneVerified: true,
      },
    });
    await prisma.clientSalonLink.createMany({
      data: [
        { identityId, barbershopId: shopA, status: "CONFIRMED", confirmedAt: new Date() },
        { identityId, barbershopId: shopB, status: "CONFIRMED", confirmedAt: new Date() },
      ],
    });

    // Cliente de uma unidade, vindo do CRM do salão (sem portal).
    const crmIdentityId = randomUUID();
    identityIds.push(crmIdentityId);
    await prisma.clientIdentity.create({
      data: {
        id: crmIdentityId,
        name: "[QA-AI] Cliente CRM",
        phone: "5511988880000",
        normalizedPhone: "5511988880000",
      },
    });
    await prisma.clientSalonLink.create({
      data: {
        identityId: crmIdentityId,
        barbershopId: shopA,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await stopFakeEvolution();
    await prisma.aiMessage.deleteMany({
      where: { conversation: { is: { barbershopId: { in: shopIds } } } },
    });
    await prisma.aiIntentLog.deleteMany({ where: { barbershopId: { in: shopIds } } });
    await prisma.aiConversation.deleteMany({ where: { barbershopId: { in: shopIds } } });
    await prisma.clientSalonLink.deleteMany({
      where: { identityId: { in: identityIds } },
    });
    await prisma.clientIdentity.deleteMany({ where: { id: { in: identityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.barbershop.deleteMany({ where: { id: { in: shopIds } } });
    await harness.stop();
  });

  beforeEach(() => {
    sentMessages.length = 0;
  });

  it("resolve o salão pelo número do cliente (com e sem o DDI 55)", async () => {
    const withCountryCode = await repo.resolveSalonsByPhone("5511988880000");
    const withoutCountryCode = await repo.resolveSalonsByPhone("11988880000");

    expect(withCountryCode.map(s => s.id)).toContain(shopA);
    expect(withoutCountryCode.map(s => s.id)).toContain(shopA);
  });

  it("responde com dados reais do salão e persiste conversa, mensagens e log", async () => {
    const outcome = await service.handleIncoming({
      messageId: randomUUID(),
      phone: "5511988880000",
      text: "qual o endereço de vocês?",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("answered");

    const conversation = await prisma.aiConversation.findFirst({
      where: { barbershopId: shopA, normalizedPhone: "5511988880000" },
    });
    expect(conversation).not.toBeNull();

    const messages = await prisma.aiMessage.findMany({
      where: { conversationId: conversation!.id },
      orderBy: { sentAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].direction).toBe("INBOUND");
    expect(messages[1].direction).toBe("OUTBOUND");
    expect(messages[1].intent).toBe("location");

    const logs = await prisma.aiIntentLog.findMany({
      where: { barbershopId: shopA, phone: "5511988880000" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].intent).toBe("location");

    // A resposta saiu pela Evolution, na instância da IA, com o endereço real.
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].instance).toBe(AI_INSTANCE);
    expect(sentMessages[0].number).toBe("5511988880000");
    expect(sentMessages[0].text).toContain("Rua Unidade A, 321");
  });

  it("pede a escolha quando o cliente é de duas unidades e atende a escolhida", async () => {
    const first = await service.handleIncoming({
      messageId: randomUUID(),
      phone: "5511999990000",
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(first.status).toBe("clarify_shop");
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toContain("Unidade A");
    expect(sentMessages[0].text).toContain("Unidade B");

    const second = await service.handleIncoming({
      messageId: randomUUID(),
      phone: "5511999990000",
      text: "2",
      instanceName: AI_INSTANCE,
    });

    expect(second.status).toBe("shop_selected");
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1].text).toContain("Unidade B");

    const conversationB = await prisma.aiConversation.findFirst({
      where: { barbershopId: shopB, normalizedPhone: "5511999990000" },
    });
    expect(conversationB).not.toBeNull();
  });

  it("ignora salão com o atendente de IA desligado", async () => {
    const crmIdentityId = randomUUID();
    identityIds.push(crmIdentityId);
    await prisma.clientIdentity.create({
      data: {
        id: crmIdentityId,
        name: "[QA-AI] Cliente Salão Desligado",
        phone: "5511977770000",
        normalizedPhone: "5511977770000",
      },
    });
    await prisma.clientSalonLink.create({
      data: {
        identityId: crmIdentityId,
        barbershopId: shopDisabled,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    const outcome = await service.handleIncoming({
      messageId: randomUUID(),
      phone: "5511977770000",
      text: "oi",
      instanceName: AI_INSTANCE,
    });

    expect(outcome.status).toBe("ignored");
    expect(sentMessages).toHaveLength(0);

    const conversations = await prisma.aiConversation.count({
      where: { barbershopId: shopDisabled },
    });
    expect(conversations).toBe(0);
  });

  it("webhook HTTP: recusa segredo ausente, segredo errado e mensagens de grupo", async () => {
    const app = await createTestApp();
    try {
      const previousSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
      delete process.env.EVOLUTION_WEBHOOK_SECRET;

      const withoutSecret = await app.inject({
        method: "POST",
        url: "/api/webhooks/evolution/ai",
        payload: { event: "messages.upsert", instance: AI_INSTANCE, data: {} },
      });
      expect(withoutSecret.statusCode).toBe(503);

      process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_SECRET;

      const wrongSecret = await app.inject({
        method: "POST",
        url: "/api/webhooks/evolution/ai",
        headers: { "x-webhook-secret": "senha-errada" },
        payload: { event: "messages.upsert", instance: AI_INSTANCE, data: {} },
      });
      expect(wrongSecret.statusCode).toBe(401);

      const groupMessage = await app.inject({
        method: "POST",
        url: "/api/webhooks/evolution/ai",
        headers: { "x-webhook-secret": WEBHOOK_SECRET },
        payload: {
          event: "messages.upsert",
          instance: AI_INSTANCE,
          data: {
            key: { id: randomUUID() },
            message: { from: "120363000000000000@g.us", conversation: "oi grupo" },
            remoteJid: "120363000000000000@g.us",
          },
        },
      });
      expect(groupMessage.statusCode).toBe(200);
      expect(groupMessage.json()).toMatchObject({ success: true, data: { ignored: expect.any(String) } });

      const valid = await app.inject({
        method: "POST",
        url: "/api/webhooks/evolution/ai",
        headers: { "x-webhook-secret": WEBHOOK_SECRET },
        payload: {
          event: "messages.upsert",
          instance: AI_INSTANCE,
          data: {
            key: { id: randomUUID() },
            message: { from: "5511988880000@s.whatsapp.net", conversation: "oi" },
            remoteJid: "5511988880000@s.whatsapp.net",
          },
        },
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toMatchObject({ success: true, data: { queued: true } });

      process.env.EVOLUTION_WEBHOOK_SECRET = previousSecret;
    } finally {
      await closeTestApp(app);
    }
  });

  it("webhook HTTP: dono de um salão não acessa as conversas de outro (403)", async () => {
    const app = await createTestApp();
    try {
      const token = ownerToken(ownerAId, shopA);

      const own = await app.inject({
        method: "GET",
        url: `/api/barbershops/${shopA}/ai/conversations`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(own.statusCode).toBe(200);

      const other = await app.inject({
        method: "GET",
        url: `/api/barbershops/${shopB}/ai/conversations`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(other.statusCode).toBe(403);

      const otherSettings = await app.inject({
        method: "PUT",
        url: `/api/barbershops/${shopB}/ai/settings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { enabled: true },
      });
      expect(otherSettings.statusCode).toBe(403);

      const ownSettings = await app.inject({
        method: "PUT",
        url: `/api/barbershops/${shopA}/ai/settings`,
        headers: { authorization: `Bearer ${token}` },
        payload: { enabled: false },
      });
      expect(ownSettings.statusCode).toBe(200);
      expect(ownSettings.json()).toMatchObject({
        success: true,
        data: { barbershopId: shopA, enabled: false },
      });

      const settings = await app.inject({
        method: "GET",
        url: `/api/barbershops/${shopA}/ai/settings`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(settings.json()).toMatchObject({ data: { enabled: false } });
    } finally {
      await closeTestApp(app);
    }
  });
});
