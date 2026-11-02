import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Item 2 da rodada de correções: a ordem das checagens ANTES de baixar a
 * mídia é fixa:
 *
 *   vínculo ativo → OWNER → assinatura/trial → segmento → cota →
 *   kill switch/outboundPaused → instância da plataforma → tipo de mídia →
 *   tamanho do arquivo
 *
 * Nenhuma recusa pode chegar no `downloadEvolutionMedia`.
 */

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  upload: vi.fn(async (_params: { barbershopId: string; userId: string }) => ({ id: "batch-1" })),
  checkImportQuota: vi.fn(async (_barbershopId: string) => undefined),
  platformSettings: {
    aiGloballyEnabled: true,
    ownerBotGloballyEnabled: true,
    outboundPaused: false,
  },
  availableImportTargets: vi.fn(() => ["CLIENTS"]),
}));

vi.mock("@/shared/services/evolutionApiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/services/evolutionApiService")>();
  return { ...actual, downloadEvolutionMedia: mocks.download };
});

vi.mock("@/shared/services/platformWhatsAppSettings", () => ({
  getPlatformWhatsAppSettings: vi.fn(async () => mocks.platformSettings),
  invalidatePlatformWhatsAppSettingsCache: vi.fn(),
}));

vi.mock("@/modules/dataImport/dataImportUseCases", () => ({
  DataImportUseCases: class {
    upload = mocks.upload;
    checkImportQuota = mocks.checkImportQuota;
  },
}));

vi.mock("@/modules/dataImport/dataImport.constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/dataImport/dataImport.constants")>();
  return { ...actual, availableImportTargets: mocks.availableImportTargets };
});

vi.mock("@/modules/dataImport/utils/fileValidation", () => ({
  validateImportFile: vi.fn((fileName: string, buffer: Buffer) => ({
    fileName,
    extension: ".xlsx",
    format: "XLSX",
    fileSize: buffer.length,
  })),
}));

import { AppError } from "@/shared/errors/AppError";
import { OwnerBotService } from "./ownerBotService";
import { InMemoryOwnerBotStore } from "./ownerBotStore";

const PHONE = "551199999999";
const MEDIA_DOCUMENT = {
  type: "document" as const,
  mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  fileName: "clientes.xlsx",
  fileLength: 1024,
};

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    userId: "user-1",
    barbershopId: "shop-1",
    normalizedPhone: PHONE,
    linkedAt: new Date("2026-10-01T00:00:00Z"),
    user: { id: "user-1", name: "Dona Marina", role: "OWNER", active: true },
    barbershop: {
      id: "shop-1",
      name: "Studio Marina",
      businessSegment: "HAIR_SALON",
      whatsapp: PHONE,
      active: true,
    },
    ...overrides,
  };
}

function buildService(options: {
  links?: unknown[];
  hasAccess?: boolean;
} = {}) {
  const sent: string[] = [];
  const repo = {
    findActiveLinksByPhone: vi.fn(async () => options.links ?? [makeLink()]),
    logAction: vi.fn(async (_entry: Record<string, unknown>) => "log-1"),
    touchLink: vi.fn(async () => undefined),
  };
  const store = new InMemoryOwnerBotStore();
  // Espião da checagem de assinatura: serve para provar que a checagem de
  // papel (OWNER) vem ANTES e interrompe o fluxo.
  const hasAccess = vi.fn(async () => options.hasAccess ?? true);
  const service = new OwnerBotService({
    repo: repo as never,
    store,
    messenger: {
      send: vi.fn(async (_phone: string, text: string) => {
        sent.push(text);
        return true;
      }),
    },
    hasAccess,
  });
  return { service, sent, repo, store, hasAccess };
}

async function sendMedia(
  service: ReturnType<typeof buildService>["service"],
  media: { type: "image" | "document" | "audio" | "video"; mimetype?: string; fileName?: string; fileLength?: number } = MEDIA_DOCUMENT
) {
  await service.handleIncoming({
    messageId: `msg-${Math.random()}`,
    phone: PHONE,
    text: "",
    instanceName: "agendai-plataforma",
    remoteJid: `${PHONE}@s.whatsapp.net`,
    media,
  });
}

describe("importação por mídia — log de ações", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformSettings.aiGloballyEnabled = true;
    mocks.platformSettings.ownerBotGloballyEnabled = true;
    mocks.platformSettings.outboundPaused = false;
    mocks.availableImportTargets.mockReturnValue(["CLIENTS"]);
    mocks.checkImportQuota.mockResolvedValue(undefined);
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("conteudo"),
      mimetype: MEDIA_DOCUMENT.mimetype,
      fileName: "clientes.xlsx",
    });
    mocks.upload.mockResolvedValue({ id: "batch-1" });
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
  });

  it("grava o log da mídia recebida e o do lote criado", async () => {
    const { service, repo } = buildService();

    await sendMedia(service);

    const acoes = vi.mocked(repo.logAction).mock.calls.map((c) => c[0]);
    expect(acoes.some((a) => a.action === "IMPORT_MEDIA_RECEIVED" && a.status === "SUCCESS")).toBe(true);
    expect(acoes.some((a) => a.action === "IMPORT_MEDIA_CREATED" && a.status === "SUCCESS")).toBe(true);
  });

  it("grava a recusa com status BLOCKED e o motivo", async () => {
    const { service, repo } = buildService({
      links: [makeLink({ user: { id: "user-1", name: "Marina", role: "BARBER", active: true } })],
    });

    await sendMedia(service);

    const acoes = vi.mocked(repo.logAction).mock.calls.map((c) => c[0]);
    const recusa = acoes.find((a) => a.status === "BLOCKED");
    expect(recusa).toBeTruthy();
    expect(recusa!.errorMessage).toContain("OWNER");
    expect(recusa!.barbershopId).toBe("shop-1");
  });

  it("não grava log com barbershopId fictício e não loga número não vinculado", async () => {
    const { service, repo } = buildService({ links: [] });

    await sendMedia(service);

    expect(repo.logAction).not.toHaveBeenCalled();
    const acoes = vi.mocked(repo.logAction).mock.calls.map((c) => c[0]);
    expect(acoes.some((a) => a.barbershopId === "00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});

describe("importação por mídia — escolha de salão", () => {
  const OUTRO_SHOP = {
    id: "link-2",
    userId: "user-2",
    barbershopId: "shop-2",
    normalizedPhone: PHONE,
    linkedAt: new Date("2026-10-01T00:00:00Z"),
    user: { id: "user-2", name: "Dona Bea", role: "OWNER", active: true },
    barbershop: {
      id: "shop-2",
      name: "Studio Bea",
      businessSegment: "HAIR_SALON",
      whatsapp: PHONE,
      active: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformSettings.aiGloballyEnabled = true;
    mocks.platformSettings.ownerBotGloballyEnabled = true;
    mocks.platformSettings.outboundPaused = false;
    mocks.availableImportTargets.mockReturnValue(["CLIENTS"]);
    mocks.checkImportQuota.mockResolvedValue(undefined);
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("conteudo"),
      mimetype: MEDIA_DOCUMENT.mimetype,
      fileName: "clientes.xlsx",
    });
    mocks.upload.mockResolvedValue({ id: "batch-1" });
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
  });

  it("com 1 vínculo não pergunta a lista e importa direto", async () => {
    const { service, sent } = buildService();

    await sendMedia(service);

    expect(sent.join(" ")).not.toContain("unidades vinculadas");
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ barbershopId: "shop-1" }));
  });

  it("com 2 vínculos pede a escolha e não baixa nem importa nada", async () => {
    const { service, sent } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);

    expect(sent.join(" ")).toContain("Studio Marina");
    expect(sent.join(" ")).toContain("Studio Bea");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("escolha válida importa só no salão escolhido", async () => {
    const { service } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);
    await service.handleIncoming({ messageId: "msg-2", phone: PHONE, text: "2" });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ barbershopId: "shop-2" }));
    expect(
      vi.mocked(mocks.upload).mock.calls.some((c) => c[0].barbershopId === "shop-1")
    ).toBe(false);
  });

  it("resposta não numérica é inválida: repete a lista uma vez", async () => {
    const { service, sent } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);
    sent.length = 0;
    await service.handleIncoming({ messageId: "msg-2", phone: PHONE, text: "abc" });

    expect(sent.join(" ")).toContain("Studio Marina");
    expect(sent.join(" ")).toContain("Studio Bea");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("segunda resposta inválida cancela a importação", async () => {
    const { service, sent } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);
    await service.handleIncoming({ messageId: "msg-2", phone: PHONE, text: "abc" });
    sent.length = 0;
    await service.handleIncoming({ messageId: "msg-3", phone: PHONE, text: "xyz" });

    expect(sent.join(" ").toLowerCase()).toContain("cancelada");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("número fora do intervalo é inválido", async () => {
    const { service, sent } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);
    sent.length = 0;
    await service.handleIncoming({ messageId: "msg-2", phone: PHONE, text: "9" });

    expect(sent.join(" ")).toContain("Studio Bea");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("pendência expirada avisa e não importa", async () => {
    const { service, sent, store } = buildService({ links: [makeLink(), OUTRO_SHOP] });

    await sendMedia(service);
    const state = await store.getState(PHONE);
    expect(state?.pendingMediaImport).toBeTruthy();
    state!.pendingMediaImport!.createdAt = Date.now() - 11 * 60 * 1000;
    await store.setState(PHONE, state!);
    sent.length = 0;

    await service.handleIncoming({ messageId: "msg-2", phone: PHONE, text: "1" });

    expect(sent.join(" ").toLowerCase()).toContain("expirou");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("importação por mídia — ordem das checagens antes do download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformSettings.aiGloballyEnabled = true;
    mocks.platformSettings.ownerBotGloballyEnabled = true;
    mocks.platformSettings.outboundPaused = false;
    mocks.availableImportTargets.mockReturnValue(["CLIENTS"]);
    mocks.checkImportQuota.mockResolvedValue(undefined);
    mocks.download.mockResolvedValue({
      buffer: Buffer.from("conteudo"),
      mimetype: MEDIA_DOCUMENT.mimetype,
      fileName: "clientes.xlsx",
    });
    mocks.upload.mockResolvedValue({ id: "batch-1" });
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
  });

  it("recusa vínculo inativo sem baixar", async () => {
    const { service, sent } = buildService({
      links: [makeLink({ barbershop: { ...makeLink().barbershop, active: false } })],
    });

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("inativo");
  });

  it("recusa quem não é OWNER sem baixar", async () => {
    const { service } = buildService({
      links: [makeLink({ user: { id: "user-1", name: " Marina", role: "BARBER", active: true } })],
    });

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("com DUAS recusas ao mesmo tempo, vence a primeira da ordem (não OWNER antes de assinatura)", async () => {
    // O usuário não é OWNER **e** a assinatura está vencida. A ordem fixa
    // diz que o papel OWNER vem antes da assinatura: o motivo gravado no log
    // tem que ser o do OWNER, e não o da assinatura.
    const { service, repo, sent, hasAccess } = buildService({
      hasAccess: false,
      links: [makeLink({ user: { id: "user-1", name: "Marina", role: "BARBER", active: true } })],
    });

    await sendMedia(service);

    const recusa = vi
      .mocked(repo.logAction)
      .mock.calls.map((c) => c[0])
      .find((a) => a.status === "BLOCKED");
    expect(recusa).toBeTruthy();
    expect(recusa!.errorMessage).toContain("OWNER");
    expect(recusa!.errorMessage).not.toContain("assinatura");
    expect(sent.join(" ")).toContain("dono");
    expect(mocks.download).not.toHaveBeenCalled();

    // Prova da ordem: a checagem de assinatura nem chegou a ser consultada.
    expect(hasAccess).not.toHaveBeenCalled();
  });

  it("com DUAS recusas ao mesmo tempo (salão inativo + assinatura vencida), vence o salão inativo", async () => {
    const { service, repo, sent, hasAccess } = buildService({
      hasAccess: false,
      links: [makeLink({ barbershop: { ...makeLink().barbershop, active: false } })],
    });

    await sendMedia(service);

    const recusa = vi
      .mocked(repo.logAction)
      .mock.calls.map((c) => c[0])
      .find((a) => a.status === "BLOCKED");
    expect(recusa).toBeTruthy();
    expect(recusa!.errorMessage).toContain("inativo");
    expect(recusa!.errorMessage).not.toContain("assinatura");
    expect(sent.join(" ")).toContain("inativo");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(hasAccess).not.toHaveBeenCalled();
  });

  it("recusa assinatura/trial inativo sem baixar", async () => {
    const { service } = buildService({ hasAccess: false });

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("recusa segmento sem alvo de importação sem baixar", async () => {
    mocks.availableImportTargets.mockReturnValue([]);
    const { service } = buildService();

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("recusa quando a cota de importações foi atingida, sem baixar", async () => {
    mocks.checkImportQuota.mockRejectedValue(
      new AppError("Limite de 5 importações por hora atingido. Tente mais tarde.", 429)
    );
    const { service, sent } = buildService();

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("Limite de 5 importações por hora");
  });

  it("não responde nem importa quando os envios estão pausados", async () => {
    mocks.platformSettings.outboundPaused = true;
    const { service, sent } = buildService();

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("pausado = silêncio total: nem recusa responde", async () => {
    mocks.platformSettings.outboundPaused = true;
    const { service, sent, repo } = buildService({
      links: [makeLink({ user: { id: "user-1", name: "Marina", role: "BARBER", active: true } })],
    });

    await sendMedia(service);

    // A recusa continua registrada (auditoria interna), mas o dono não ouve nada.
    expect(sent).toHaveLength(0);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(repo.logAction).toHaveBeenCalled();
  });

  it("não responde nem importa quando o assistente está desligado globalmente", async () => {
    mocks.platformSettings.ownerBotGloballyEnabled = false;
    const { service, sent } = buildService();

    await sendMedia(service);

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("não baixa mídia recebida em instância que não é a da plataforma", async () => {
    const { service, sent } = buildService();

    await service.handleIncoming({
      messageId: "msg-instancia",
      phone: PHONE,
      text: "",
      instanceName: "loja-123",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media: MEDIA_DOCUMENT,
    });

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("recusa tipo de mídia não suportado sem baixar", async () => {
    const { service, sent } = buildService();

    await sendMedia(service, { type: "audio", mimetype: "audio/ogg", fileLength: 100 });

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain(".xlsx");
  });

  it("a resposta para áudio/vídeo não menciona foto", async () => {
    const { service, sent } = buildService();

    await sendMedia(service, { type: "video", mimetype: "video/mp4", fileLength: 100 });

    const resposta = sent.join(" ");
    expect(resposta.toLowerCase()).not.toContain("foto");
    expect(resposta).toContain(".xlsx");
  });

  it("recusa arquivo acima de 10 MB sem baixar", async () => {
    const { service, sent } = buildService();

    await sendMedia(service, { ...MEDIA_DOCUMENT, fileLength: 11 * 1024 * 1024 });

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("10 MB");
  });

  it("não reprocessa o reenvio da mesma mídia (mesmo messageId)", async () => {
    const { service, sent } = buildService();
    const media = MEDIA_DOCUMENT;

    await service.handleIncoming({
      messageId: "msg-reenvio",
      phone: PHONE,
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media,
    });
    await service.handleIncoming({
      messageId: "msg-reenvio",
      phone: PHONE,
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media,
    });

    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it("baixa e importa quando todas as checagens passam", async () => {
    const { service } = buildService();

    await sendMedia(service);

    expect(mocks.checkImportQuota).toHaveBeenCalledWith("shop-1");
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledWith(
      "agendai-plataforma",
      expect.any(String),
      `${PHONE}@s.whatsapp.net`
    );
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        barbershopId: "shop-1",
        userId: "user-1",
        source: "WHATSAPP_OWNER_BOT",
      })
    );
  });
});
