/**
 * Privacidade dos logs no caminho do OCR (importação por imagem).
 *
 * Regra: **nenhum log pode carregar o valor lido na célula** (nome,
 * telefone, valor, número de processo). O log carrega contagem, tempo e
 * resolução — nunca a informação do cliente.
 *
 * O teste intercepta o logger inteiro (todos os métodos) e serializa TODOS os
 * argumentos de cada chamada. Se o valor da célula aparecer em qualquer lugar
 * — inclusive dentro de um objeto aninhado, de um array ou de um Error — o
 * teste falha.
 *
 * O caminho exercitado é o real: upload da imagem → OCR (extrator simulado) →
 * gravação do lote → revisão de uma célula → confirmação. Só o motor de OCR e
 * o banco são simulados; os arquivos em disco são reais.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOME = "Ana Souza";
const TELEFONE = "11987654321";
const CORRIGIDO = "11999998877";
const SENTINELA = "CPF-SENTINELA-9137";

type Chamada = { metodo: string; args: unknown[] };

const chamadas: Chamada[] = [];

// A flag é lida na importação do módulo — precisa estar ligada antes.
vi.hoisted(() => {
  process.env.OCR_IMPORT_ENABLED = "on";
});

vi.mock("@/shared/utils/logger", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/utils/logger")>();
  const metodos = ["trace", "debug", "info", "warn", "error", "fatal"];
  const falso: Record<string, unknown> = {};
  for (const metodo of metodos) {
    falso[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args });
    };
  }
  falso.child = () => falso;
  falso.silent = () => undefined;
  return { ...original, getModuleLogger: () => falso, logger: falso };
});

const prismaMock = vi.hoisted(() => ({
  importBatchCreate: vi.fn(),
  importBatchFindFirst: vi.fn(),
  importBatchFindMany: vi.fn(async () => []),
  importBatchCount: vi.fn(async () => 0),
  importBatchUpdateMany: vi.fn(async () => ({ count: 1 })),
  barbershopFindUnique: vi.fn(async () => ({ businessSegment: null })),
  auditLogCreate: vi.fn(async () => ({})),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    importBatch: {
      create: prismaMock.importBatchCreate,
      findFirst: prismaMock.importBatchFindFirst,
      findMany: prismaMock.importBatchFindMany,
      count: prismaMock.importBatchCount,
      updateMany: prismaMock.importBatchUpdateMany,
    },
    barbershop: { findUnique: prismaMock.barbershopFindUnique },
    auditLog: { create: prismaMock.auditLogCreate },
  },
}));

// O reconhecedor não está instalado nesta máquina: sem este mock o upload
// seria recusado antes de qualquer verificação. O que interessa aqui é o que
// É logado, não a leitura da imagem.
vi.mock("./ocrWorker", () => ({
  OCR_TESSDATA_PATH: "/tmp/tessdata-privacidade",
  caminhoTessdata: () => "/tmp/tessdata-privacidade",
  linguasTessdata: () => ["eng"],
  verificarTessdata: () => ({ ok: true, caminho: "/tmp/tessdata-privacidade", faltantes: [] }),
  erroTessdataAusente: () => new Error("traineddata ausente"),
  shutdownOcrWorker: vi.fn(),
  getOcrWorker: vi.fn(),
  ocrImage: vi.fn(),
}));

// O OCR "lê" uma tabela de duas colunas: o valor da célula entra no fluxo
// inteiro (arquivo do lote, revisão e confirmação).
vi.mock("./ocrExtractor", () => ({
  extrairImagem: vi.fn(async () => ({
    headers: ["Coluna 1", "Coluna 2"],
    celulas: [
      [
        { valor: NOME, confianca: 99, origem: "ocr", linha: 1, coluna: 0 },
        { valor: TELEFONE, confianca: 99, origem: "ocr", linha: 1, coluna: 1 },
      ],
    ],
    sheet: {
      sheetName: null,
      headers: ["Coluna 1", "Coluna 2"],
      rows: [{ "Coluna 1": NOME, "Coluna 2": TELEFONE }],
      sheetNames: [],
      selectedSheet: null,
    },
    larguraTabelaPx: 1200,
    larguraImagemPx: 1400,
  })),
}));

import { DataImportUseCases } from "../dataImportUseCases";
import { gerarImagensSinteticas } from "./ocrImagensSinteticas";
import { caminhoSidecarOcr } from "./ocrBatchFile";

const SHOP = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";

const [imagem] = gerarImagensSinteticas();

/** Lote do banco, com o que o dono mapeou. */
let lote: Record<string, unknown>;

beforeEach(() => {
  chamadas.length = 0;
  prismaMock.importBatchFindMany.mockResolvedValue([]);
  prismaMock.importBatchCount.mockResolvedValue(0);
  prismaMock.importBatchUpdateMany.mockResolvedValue({ count: 1 });
  prismaMock.barbershopFindUnique.mockResolvedValue({ businessSegment: null });
  prismaMock.auditLogCreate.mockResolvedValue({});
  prismaMock.importBatchCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    lote = {
      id: BATCH,
      barbershopId: SHOP,
      status: "UPLOADED",
      mapping: null,
      totalRows: 0,
      processedRows: 0,
      importedRows: 0,
      failedRows: 0,
      skippedRows: 0,
      errorMessage: null,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    return lote;
  });
  prismaMock.importBatchFindFirst.mockImplementation(async () => lote);
});

/** Serializa tudo que foi passado ao logger. */
function tudoQueFoiLogado(): string {
  return chamadas
    .map((chamada) => chamada.args.map((arg) => JSON.stringify(arg, (_chave, valor) => (valor instanceof Error ? { message: valor.message, stack: valor.stack } : valor))).join(" "))
    .join("\n");
}

describe("privacidade dos logs — OCR por imagem", () => {
  it("upload, revisão e confirmação não logam o valor lido na célula", async () => {
    const useCases = new DataImportUseCases();

    // 1) Upload da imagem: o valor lido entra no lote em disco.
    await useCases.upload({
      barbershopId: SHOP,
      fileName: "clientes.png",
      buffer: imagem.buffer,
    });

    const filePath = String(lote.filePath);
    expect(filePath).not.toBe("");

    // O valor PRECISA estar no arquivo do lote — senão o teste seria vazio.
    const csv = readFileSync(filePath, "utf8");
    expect(csv).toContain(NOME);
    expect(csv).toContain(TELEFONE);
    const sidecar = readFileSync(caminhoSidecarOcr(filePath), "utf8");
    expect(sidecar).toContain(TELEFONE);

    // 2) Revisão: o dono corrige a célula do telefone.
    lote = {
      ...lote,
      status: "MAPPING",
      mapping: {
        version: 1,
        sheets: [
          {
            sheetName: null,
            targetType: "CLIENTS",
            columns: { "0": "name", "1": "whatsapp" },
            options: {},
          },
        ],
      },
    };

    await useCases.applyOcrReview({
      barbershopId: SHOP,
      batchId: BATCH,
      linha: 1,
      coluna: 1,
      valor: CORRIGIDO,
    });

    expect(readFileSync(filePath, "utf8")).toContain(CORRIGIDO);

    // 3) Confirmação: o lote entra na fila.
    await useCases.confirm({ barbershopId: SHOP, batchId: BATCH });

    // A única coisa que pode aparecer no log são contagens e tempos.
    const logado = tudoQueFoiLogado();
    expect(logado).not.toContain(NOME);
    expect(logado).not.toContain(TELEFONE);
    expect(logado).not.toContain(CORRIGIDO);
    expect(logado).not.toContain(SENTINELA);

    // O log que existe de fato: contagem, tempo e resolução.
    expect(logado).toContain("OCR de imagem concluído");
  });

  it("o valor corrigido pelo dono também não vaza para o log", async () => {
    const useCases = new DataImportUseCases();

    await useCases.upload({
      barbershopId: SHOP,
      fileName: "clientes.png",
      buffer: imagem.buffer,
    });

    lote = {
      ...lote,
      status: "MAPPING",
      mapping: {
        version: 1,
        sheets: [
          {
            sheetName: null,
            targetType: "CLIENTS",
            columns: { "0": "name", "1": "whatsapp" },
            options: {},
          },
        ],
      },
    };

    await useCases.applyOcrReview({
      barbershopId: SHOP,
      batchId: BATCH,
      linha: 1,
      coluna: 1,
      valor: SENTINELA,
    });

    const logado = tudoQueFoiLogado();
    expect(logado).not.toContain(SENTINELA);
    expect(logado).not.toContain(TELEFONE);
  });
});
