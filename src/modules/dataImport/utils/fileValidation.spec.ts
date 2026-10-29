import { describe, expect, it } from "vitest";
import { validateImportFile, extractExtension, sanitizeFileName } from "./fileValidation";

/** ZIP mínimo válido (vazio) — só a assinatura importa para estes testes. */
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function zipWith(sizes: Array<{ name: string; size: number }>): Buffer {
  const chunks: Buffer[] = [ZIP_HEADER];
  const central: Buffer[] = [];
  let offset = ZIP_HEADER.length;

  for (const entry of sizes) {
    const name = Buffer.from(entry.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(entry.size, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(sizes.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

describe("validateImportFile", () => {
  it("aceita CSV com conteúdo de texto", () => {
    const result = validateImportFile("clientes.csv", Buffer.from("Nome;Telefone\nAna;11999999999\n"));
    expect(result.format).toBe("CSV");
    expect(result.fileSize).toBeGreaterThan(0);
  });

  it("recusa .xlsm (macros) com mensagem explícita", () => {
    expect(() => validateImportFile("planilha.xlsm", Buffer.from("x"))).toThrow(/macros/i);
  });

  it("recusa .xls (Excel 97-2003)", () => {
    expect(() => validateImportFile("planilha.xls", Buffer.from("x"))).toThrow(/\.xls/i);
  });

  it("recusa .ods", () => {
    expect(() => validateImportFile("planilha.ods", Buffer.from("x"))).toThrow(/\.ods/i);
  });

  it("recusa .zip", () => {
    expect(() => validateImportFile("planilha.zip", Buffer.from("x"))).toThrow(/\.zip/i);
  });

  it("recusa extensão não suportada", () => {
    expect(() => validateImportFile("planilha.txt", Buffer.from("x"))).toThrow(/Formato não suportado/i);
  });

  it("recusa arquivo sem extensão", () => {
    expect(() => validateImportFile("planilha", Buffer.from("x"))).toThrow(/sem extensão/i);
  });

  it("recusa .xlsx que não é zip de verdade", () => {
    expect(() => validateImportFile("planilha.xlsx", Buffer.from("conteudo"))).toThrow(
      /não é uma planilha/i,
    );
  });

  it("recusa CSV que é na verdade binário", () => {
    const binario = Buffer.concat([Buffer.from("PK"), Buffer.alloc(10)]);
    expect(() => validateImportFile("planilha.csv", binario)).toThrow(/não é um CSV de texto/i);
  });

  it("recusa arquivo acima de 10 MB", () => {
    const grande = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    expect(() => validateImportFile("grande.csv", grande)).toThrow(/passa de 10 MB/i);
  });

  it("recusa arquivo vazio", () => {
    expect(() => validateImportFile("vazio.csv", Buffer.alloc(0))).toThrow(/vazio/i);
  });

  it("recusa .xls com assinatura OLE2 mesmo com extensão .csv", () => {
    const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32)]);
    expect(() => validateImportFile("antigo.csv", ole2)).toThrow(/\.xls/i);
  });

  it("aceita .xlsx válido", () => {
    const zip = zipWith([{ name: "[Content_Types].xml", size: 120 }]);
    const result = validateImportFile("planilha.xlsx", zip);
    expect(result.format).toBe("XLSX");
  });

  it("recusa .xlsx com conteúdo descomprimido absurdo (ZIP bomb)", () => {
    const zip = zipWith([{ name: "xl/worksheets/sheet1.xml", size: 900 * 1024 * 1024 }]);
    expect(() => validateImportFile("bomba.xlsx", zip)).toThrow(/grande demais/i);
  });
});

describe("extractExtension", () => {
  it("ignora caminho e devolve a extensão em minúsculas", () => {
    expect(extractExtension("/tmp/pasta/Planilha.XLSX")).toBe(".xlsx");
    expect(extractExtension("arquivo")).toBe("");
    expect(extractExtension("arquivo.")).toBe("");
  });
});

describe("sanitizeFileName", () => {
  it("remove caminho e caracteres de controle", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("planilha\u0000.xlsx")).toBe("planilha.xlsx");
  });

  it("nunca devolve string vazia", () => {
    expect(sanitizeFileName("")).toBe("planilha");
  });
});
