import { describe, expect, it } from "vitest";
import { decodeCsvBuffer, detectSeparator, normalizeHeaders, parseCsv } from "./csvParser";

describe("detectSeparator", () => {
  it("detecta ponto e vírgula", () => {
    expect(detectSeparator("Nome;Telefone;E-mail\nAna;119;ana@x.com")).toBe(";");
  });

  it("detecta vírgula", () => {
    expect(detectSeparator("Nome,Telefone,E-mail\nAna,119,ana@x.com")).toBe(",");
  });

  it("detecta tabulação", () => {
    expect(detectSeparator("Nome\tTelefone\tE-mail\nAna\t119\ta@x.com")).toBe("\t");
  });

  it("ignora separador dentro de aspas", () => {
    expect(detectSeparator('Nome;Observação\n"João; da Silva";ok')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("lê cabeçalho e linhas", () => {
    const result = parseCsv(Buffer.from("Nome;WhatsApp\nAna;11999999999\nBruno;11888888888\n"));
    expect(result.headers).toEqual(["Nome", "WhatsApp"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(["Ana", "11999999999"]);
  });

  it("respeita aspas com escape por aspas duplicadas", () => {
    const result = parseCsv(Buffer.from('Nome;Obs\n"Ana ""A."" Silva";ok'));
    expect(result.rows[0][0]).toBe('Ana "A." Silva');
  });

  it("aceita quebra de linha dentro do campo entre aspas", () => {
    const result = parseCsv(Buffer.from('Nome;Obs\n"Ana";"linha1\nlinha2"'));
    expect(result.rows[0][1]).toBe("linha1\nlinha2");
  });

  it("preenche colunas faltantes e descarta excedentes", () => {
    const result = parseCsv(Buffer.from("A;B;C\n1;2\n1;2;3;4"));
    expect(result.rows[0]).toEqual(["1", "2", ""]);
    expect(result.rows[1]).toEqual(["1", "2", "3"]);
  });

  it("lê CSV separado por tabulação", () => {
    const result = parseCsv(Buffer.from("Nome\tWhatsApp\nAna\t11999999999"));
    expect(result.headers).toEqual(["Nome", "WhatsApp"]);
    expect(result.rows[0][1]).toBe("11999999999");
  });

  it("não vira registro a linha vazia do fim", () => {
    const result = parseCsv(Buffer.from("Nome\nAna\n\n"));
    expect(result.rows).toHaveLength(1);
  });
});

describe("decodeCsvBuffer", () => {
  it("remove BOM UTF-8", () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Ana;119")]);
    expect(decodeCsvBuffer(buffer)).toBe("Ana;119");
  });

  it("decodifica UTF-16 LE com BOM", () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ana;119", "utf16le")]);
    expect(decodeCsvBuffer(buffer)).toBe("Ana;119");
  });

  it("mantém acentos em Latin-1 quando o conteúdo não é UTF-8 válido", () => {
    const buffer = Buffer.from([0x4a, 0x61, 0x6e, 0x65, 0x3b, 0x4a, 0xe9, 0x72, 0x6f, 0x6e]);
    expect(decodeCsvBuffer(buffer)).toContain("Jéron");
  });
});

describe("normalizeHeaders", () => {
  it("remove quebras de linha e caracteres de controle", () => {
    expect(normalizeHeaders(["Nome\ndo cliente"])).toEqual(["Nome do cliente"]);
  });

  it("torna cabeçalhos repetidos únicos", () => {
    expect(normalizeHeaders(["Nome", "Nome", "Nome"])).toEqual(["Nome", "Nome (2)", "Nome (3)"]);
  });

  it("usa nome padrão quando o cabeçalho está vazio", () => {
    expect(normalizeHeaders(["", "X"])).toEqual(["Coluna 1", "X"]);
  });
});
