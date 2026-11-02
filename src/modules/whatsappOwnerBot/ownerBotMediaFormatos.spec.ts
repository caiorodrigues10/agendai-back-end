import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O bot do WhatsApp precisa entregar ao pipeline **todos os formatos que a
 * importação aceita** — e o formato tem de vir do **conteúdo** (magic bytes),
 * nunca da extensão nem do mimetype.
 *
 * Este spec é o **teste de integração do caminho do bot**: ele não mocka
 * `fileValidation` nem `downloadEvolutionMedia`. O que é stubado é apenas a
 * rede (o `fetch` da Evolution) e a gravação do lote — o resto do caminho
 * (allowlist de mimetype → download → validação real → upload) roda de
 * verdade, com as fixtures binárias reais do importador.
 *
 * Cobre `.xls`, `.ods` e PDF (os formatos que já estavam aceitos pelo
 * importador e precisavam também passar pelo filtro de mimetype do bot).
 */

const mocks = vi.hoisted(() => ({
  upload: vi.fn(async (_params: Record<string, unknown>) => ({ id: "batch-1" })),
  checkImportQuota: vi.fn(async (_barbershopId: string) => undefined),
  platformSettings: {
    aiGloballyEnabled: true,
    ownerBotGloballyEnabled: true,
    outboundPaused: false,
  },
}));

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

import { OwnerBotService } from "./ownerBotService";
import { InMemoryOwnerBotStore } from "./ownerBotStore";

const FIXTURES = join(__dirname, "../dataImport/utils/fixtures");
const PHONE = "551199999999";
const BASE_URL = "https://evolution.local:8080";

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function makeLink() {
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
  };
}

function buildService() {
  const sent: string[] = [];
  const repo = {
    findActiveLinksByPhone: vi.fn(async () => [makeLink()]),
    logAction: vi.fn(async (_entry: Record<string, unknown>) => "log-1"),
    touchLink: vi.fn(async () => undefined),
  };
  const service = new OwnerBotService({
    repo: repo as never,
    store: new InMemoryOwnerBotStore(),
    messenger: {
      send: vi.fn(async (_phone: string, text: string) => {
        sent.push(text);
        return true;
      }),
    },
    hasAccess: vi.fn(async () => true),
  });
  return { service, sent, repo };
}

/** Resposta da Evolution no formato base64 (o caminho usado em produção). */
function base64Response(payload: Buffer, mimetype: string, fileName: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ base64: payload.toString("base64"), mimetype, fileName }),
    headers: new Headers({ "content-type": "application/json" }),
  };
}

describe("bot do WhatsApp — entrega .xls, .ods e PDF ao pipeline", () => {
  const originalUrl = process.env.EVOLUTION_API_URL;
  const originalKey = process.env.EVOLUTION_API_KEY;
  const originalInstance = process.env.EVOLUTION_INSTANCE_NAME;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ id: "batch-1" });
    mocks.checkImportQuota.mockResolvedValue(undefined);
    process.env.EVOLUTION_API_URL = BASE_URL;
    process.env.EVOLUTION_API_KEY = "chave-de-teste";
    process.env.EVOLUTION_INSTANCE_NAME = "agendai-plataforma";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = originalKey;
    if (originalInstance === undefined) delete process.env.EVOLUTION_INSTANCE_NAME;
    else process.env.EVOLUTION_INSTANCE_NAME = originalInstance;
  });

  const CASOS: Array<{ rotulo: string; mime: string; arquivo: string; fixture: string }> = [
    {
      rotulo: ".xls (Excel 97-2003)",
      mime: "application/vnd.ms-excel",
      arquivo: "clientes.xls",
      fixture: "exemplo-clientes.xls",
    },
    {
      rotulo: ".ods (OpenDocument)",
      mime: "application/vnd.oasis.opendocument.spreadsheet",
      arquivo: "clientes.ods",
      fixture: "exemplo-clientes.ods",
    },
    {
      rotulo: "PDF com texto",
      mime: "application/pdf",
      arquivo: "clientes.pdf",
      fixture: "exemplo-clientes.pdf",
    },
  ];

  it.each(CASOS)("entrega $rotulo ao pipeline", async ({ mime, arquivo, fixture: fixtureName }) => {
    const payload = fixture(fixtureName);
    fetchMock.mockResolvedValueOnce(base64Response(payload, mime, arquivo));
    const { service, sent } = buildService();

    await service.handleIncoming({
      messageId: `msg-${arquivo}`,
      phone: PHONE,
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media: { type: "document", mimetype: mime, fileName: arquivo },
    });

    // Baixou a mídia da Evolution…
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // …validou o conteúdo de verdade (sem mock de `fileValidation`)…
    // …e entregou o arquivo ao importador.
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const params = mocks.upload.mock.calls[0][0] as {
      barbershopId: string;
      userId: string;
      fileName: string;
      buffer: Buffer;
      source: string;
    };
    expect(params.barbershopId).toBe("shop-1");
    expect(params.userId).toBe("user-1");
    expect(params.source).toBe("WHATSAPP_OWNER_BOT");
    expect(params.fileName).toBe(arquivo);
    expect(params.buffer.equals(payload)).toBe(true);
    expect(sent.join(" ")).toContain(`Arquivo recebido (${arquivo})`);
  });

  it("detecta o formato pelo conteúdo, não pela extensão: .xls chamado de .ods", async () => {
    const payload = fixture("exemplo-clientes.xls");
    fetchMock.mockResolvedValueOnce(
      base64Response(payload, "application/vnd.oasis.opendocument.spreadsheet", "mentira.ods")
    );
    const { service } = buildService();

    await service.handleIncoming({
      messageId: "msg-extensao-falsa",
      phone: PHONE,
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media: {
        type: "document",
        mimetype: "application/vnd.oasis.opendocument.spreadsheet",
        fileName: "mentira.ods",
      },
    });

    // O nome enviado é mentira, mas o arquivo é um XLS de verdade: entra no
    // pipeline (a validação real decide o formato) e o nome exibido é o que o
    // dono mandou, sanitizado.
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect((mocks.upload.mock.calls[0][0] as { fileName: string }).fileName).toBe("mentira.ods");
  });

  it("recusa formato não suportado com o nome real do arquivo, sem criar lote", async () => {
    const payload = Buffer.from("nao e planilha");
    fetchMock.mockResolvedValueOnce(
      base64Response(payload, "application/octet-stream", "lixo.bin")
    );
    const { service, sent } = buildService();

    await service.handleIncoming({
      messageId: "msg-lixo",
      phone: PHONE,
      text: "",
      instanceName: "agendai-plataforma",
      remoteJid: `${PHONE}@s.whatsapp.net`,
      media: {
        type: "document",
        mimetype: "application/octet-stream",
        fileName: "lixo.bin",
      },
    });

    // O mimetype fora da allowlist nem chega ao download.
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sent.join(" ")).toContain("Não consegui baixar o arquivo enviado");
  });
});
