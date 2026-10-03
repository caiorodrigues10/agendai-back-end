/// <reference types="vitest/globals" />

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guarda de cardinalidade (B22): nenhuma métrica/span pode receber
 * atributos com chave de alta cardinalidade (ids, e-mails, telefones,
 * caminhos de request...). A criação de métricas em si é permitida —
 * só o *atributo* com chave proibida é que quebra a cardinalidade.
 */

const TOKENS_ATRIBUTO = [
  "setAttribute(",
  "setAttributes(",
  "labelNames",
  ".labels(",
  "attributes:",
  "addEvent(",
];

// Mais específico primeiro: a alternância do regex tenta na ordem,
// então "userId" precisa vir antes de "id".
const CHAVES_PROIBIDAS = [
  "userId",
  "barbershopId",
  "clientId",
  "correlationId",
  "requestId",
  "campaignRecipientId",
  "appointmentId",
  "destination",
  "email",
  "phone",
  "cpf",
  "cnpj",
  "uuid",
  "token",
  "path",
  "url",
  "target",
  "id",
];

const REGEX_CHAVE_PROIBIDA = new RegExp(
  `["'\`](${CHAVES_PROIBIDAS.join("|")})["'\`]`,
  "i",
);

const RAIZ_SRC = join(process.cwd(), "src");

function coletarArquivosTs(diretorio: string, saida: string[] = []): string[] {
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const completo = join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      if (["node_modules", "dist", "graphify-out"].includes(entrada.name)) {
        continue;
      }
      coletarArquivosTs(completo, saida);
    } else if (
      entrada.name.endsWith(".ts") &&
      !entrada.name.endsWith(".spec.ts") &&
      !entrada.name.endsWith(".test.ts")
    ) {
      saida.push(completo);
    }
  }
  return saida;
}

/**
 * Retorna as linhas (1-based) em que um token de contexto de atributo
 * aparece "perto" (mesma linha ou vizinhança de 1) de uma chave literal
 * proibida.
 */
export function encontrarViolacoes(conteudo: string, arquivo: string): string[] {
  const linhas = conteudo.split(/\r?\n/);
  const violacoes: string[] = [];

  linhas.forEach((linha, indice) => {
    const token = TOKENS_ATRIBUTO.find((t) => linha.includes(t));
    if (!token) return;

    const janela = linhas
      .slice(Math.max(0, indice - 1), indice + 2)
      .join("\n");
    const chave = janela.match(REGEX_CHAVE_PROIBIDA);
    if (chave) {
      violacoes.push(`${arquivo}:${indice + 1} (${token} perto de "${chave[1]}")`);
    }
  });

  return violacoes;
}

describe("B22 — cardinalidade de métricas e spans", () => {
  it("nenhum arquivo de src define atributo de alta cardinalidade", () => {
    const arquivos = coletarArquivosTs(RAIZ_SRC);
    expect(arquivos.length).toBeGreaterThan(100);

    const violacoes = arquivos.flatMap((arquivo) =>
      encontrarViolacoes(readFileSync(arquivo, "utf8"), relative(process.cwd(), arquivo)),
    );

    expect(violacoes).toEqual([]);
  });

  it("o detector acusa violação sintética (não é guarda vazia)", () => {
    const sintetico = [
      'counter.setAttribute("userId", user.id);',
      'histogram.record(ms, { attributes: { "destination": dest } });',
      'counter.labels({ "phone": phone }).inc(1);',
    ].join("\n");
    const violacoes = encontrarViolacoes(sintetico, "sintetico.ts");
    expect(violacoes.length).toBeGreaterThanOrEqual(3);
  });

  it("criação de métrica sem chave proibida passa pelo detector", () => {
    const legitimo = [
      'const counter = meter.createCounter("agendai_jobs_total");',
      "",
      'counter.add(1, { queue: "email", outcome: "ok" });',
      "",
      'histogram.record(ms, { attributes: { status: "ok" } });',
    ].join("\n");
    expect(encontrarViolacoes(legitimo, "legitimo.ts")).toEqual([]);
  });
});
