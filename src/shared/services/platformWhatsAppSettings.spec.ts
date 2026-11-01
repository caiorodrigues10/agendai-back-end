import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    platformWhatsAppSetting: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

import {
  getPlatformWhatsAppSettings,
  invalidatePlatformWhatsAppSettingsCache,
} from "./platformWhatsAppSettings";

describe("configuração global de WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePlatformWhatsAppSettingsCache();
  });

  it("modo seguro: falha de leitura pausa envios e desliga IA/assistente", async () => {
    mocks.findUnique.mockRejectedValue(new Error("db down"));

    const settings = await getPlatformWhatsAppSettings();

    expect(settings).toMatchObject({
      aiGloballyEnabled: false,
      ownerBotGloballyEnabled: false,
      outboundPaused: true,
    });
  });

  it("lê a linha global quando disponível", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "global",
      aiGloballyEnabled: true,
      ownerBotGloballyEnabled: false,
      outboundPaused: true,
      reason: "manutenção",
      updatedBy: "admin-1",
      updatedAt: new Date("2026-10-31T10:00:00Z"),
    });

    const settings = await getPlatformWhatsAppSettings();

    expect(settings).toMatchObject({
      aiGloballyEnabled: true,
      ownerBotGloballyEnabled: false,
      outboundPaused: true,
      reason: "manutenção",
      updatedBy: "admin-1",
    });
  });
});
