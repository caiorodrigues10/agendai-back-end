import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Item 6 da rodada de correções: o download da mídia da Evolution é uma
 *Surface de SSRF (a URL vem da Evolution, não do usuário — mas a Evolution
 * pode estar comprometida). O download só pode voltar para o mesmo host da
 * Evolution API, precisa respeitar o limite de bytes (cancelando o reader)
 * e não pode aceitar redirect para fora.
 */

import { downloadEvolutionMedia } from "./evolutionApiService";

const BASE_URL = "https://evolution.local:8080";
const INSTANCES = "agendai-plataforma";
const MESSAGE_ID = "msg-1";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  };
}

/** Resposta com stream de corpo — para testar o limite de bytes. */
function streamResponse(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let index = 0;
  const cancel = vi.fn(async () => undefined);
  const reader = {
    read: vi.fn(async () => {
      if (index >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[index++] };
    }),
    cancel,
  };
  return {
    response: {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      headers: new Headers({
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ...headers,
      }),
    },
    reader,
    cancel,
  };
}

describe("downloadEvolutionMedia — proteção contra SSRF e limite de tamanho", () => {
  const originalUrl = process.env.EVOLUTION_API_URL;
  const originalKey = process.env.EVOLUTION_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = BASE_URL;
    process.env.EVOLUTION_API_KEY = "chave-de-teste";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = originalKey;
  });

  it("baixa a mídia do mesmo host (caminho feliz)", async () => {
    const payload = Buffer.from("conteudo-xlsx");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaUrl: `${BASE_URL}/media/arquivo.xlsx` }))
      .mockResolvedValueOnce(streamResponse([payload]).response);

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).not.toBeNull();
    expect(result!.buffer.equals(payload)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bloqueia URL de outro host", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ mediaUrl: "https://outro-host.example/media/arquivo.xlsx" }));

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bloqueia o endereço de metadados da nuvem (169.254.169.254)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ mediaUrl: "http://169.254.169.254/latest/meta-data/" }));

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bloqueia redirect para fora", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaUrl: `${BASE_URL}/media/arquivo.xlsx` }))
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ location: "https://outro-host.example/arquivo.xlsx" }),
        body: null,
      });

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recusa a resposta grande pelo Content-Length sem ler o corpo", async () => {
    const grande = streamResponse([Buffer.alloc(1024)], {
      "content-length": String(50 * 1024 * 1024),
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaUrl: `${BASE_URL}/media/arquivo.xlsx` }))
      .mockResolvedValueOnce(grande.response);

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
    expect(grande.reader.read).not.toHaveBeenCalled();
  });

  it("cancela o reader quando o corpo estoura o limite", async () => {
    const chunk = new Uint8Array(6 * 1024 * 1024);
    const grande = streamResponse([chunk, chunk], { "content-length": "1" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaUrl: `${BASE_URL}/media/arquivo.xlsx` }))
      .mockResolvedValueOnce(grande.response);

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
    expect(grande.cancel).toHaveBeenCalledTimes(1);
  });
});

/**
 * O mimetype da mídia do WhatsApp é **filtro de entrada**, não decisão de
 * formato: o formato real vem do conteúdo (magic bytes, em
 * `detectImportFormat`). Precisa, por isso, aceitar os mimetypes de todos os
 * formatos que a importação lê — inclusive `.xls`, `.ods` e `.xlsm`, que
 * faltavam.
 */
describe("downloadEvolutionMedia — mimetypes das planilhas aceitos", () => {
  const originalUrl = process.env.EVOLUTION_API_URL;
  const originalKey = process.env.EVOLUTION_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = BASE_URL;
    process.env.EVOLUTION_API_KEY = "chave-de-teste";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalUrl === undefined) delete process.env.EVOLUTION_API_URL;
    else process.env.EVOLUTION_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.EVOLUTION_API_KEY;
    else process.env.EVOLUTION_API_KEY = originalKey;
  });

  const ACEITOS: Array<{ mime: string; arquivo: string }> = [
    {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      arquivo: "clientes.xlsx",
    },
    { mime: "application/vnd.ms-excel.sheet.macroEnabled.12", arquivo: "clientes.xlsm" },
    { mime: "application/vnd.ms-excel", arquivo: "clientes.xls" },
    { mime: "application/vnd.oasis.opendocument.spreadsheet", arquivo: "clientes.ods" },
    { mime: "text/csv", arquivo: "clientes.csv" },
    { mime: "application/pdf", arquivo: "clientes.pdf" },
  ];

  it.each(ACEITOS)("aceita $mime (base64)", async ({ mime, arquivo }) => {
    const payload = Buffer.from("conteudo-da-planilha");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ base64: payload.toString("base64"), mimetype: mime, fileName: arquivo }),
    );

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).not.toBeNull();
    expect(result!.mimetype).toBe(mime);
    expect(result!.buffer.equals(payload)).toBe(true);
  });

  it.each(ACEITOS)("aceita $mime (mediaUrl)", async ({ mime, arquivo }) => {
    const payload = Buffer.from("conteudo-da-planilha");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaUrl: `${BASE_URL}/media/${arquivo}` }))
      .mockResolvedValueOnce(
        streamResponse([payload], { "content-type": mime }).response,
      );

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).not.toBeNull();
    expect(result!.mimetype).toBe(mime);
  });

  it("continua recusando o que o assistente não lê (áudio e vídeo)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        base64: Buffer.from("conteudo").toString("base64"),
        mimetype: "audio/ogg",
        fileName: "audio.ogg",
      }),
    );

    const result = await downloadEvolutionMedia(INSTANCES, MESSAGE_ID, "551199999999@s.whatsapp.net");

    expect(result).toBeNull();
  });
});
