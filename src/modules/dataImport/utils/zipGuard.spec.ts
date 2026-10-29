import { describe, expect, it } from "vitest";
import { inspectZip, ZipGuardError } from "./zipGuard";

/**
 * Monta um ZIP mínimo (sem comprimir) com as entradas pedidas.
 * O formato é o real: cabeçalhos locais + diretório central + EOCD.
 */
function buildZip(entries: Array<{ name: string; uncompressedSize: number }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.uncompressedSize, 18); // compressed size
    local.writeUInt32LE(entry.uncompressedSize, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(entry.uncompressedSize, 20);
    header.writeUInt32LE(entry.uncompressedSize, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

describe("inspectZip", () => {
  it("lê o diretório central e soma os tamanhos descomprimidos", () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", uncompressedSize: 1000 },
      { name: "xl/worksheets/sheet1.xml", uncompressedSize: 2500 },
    ]);

    const result = inspectZip(zip);

    expect(result.entryCount).toBe(2);
    expect(result.uncompressedBytes).toBe(3500);
    expect(result.entryNames).toContain("xl/worksheets/sheet1.xml");
  });

  it("recusa ZIP bomb (conteúdo descomprimido acima do limite)", () => {
    const zip = buildZip([{ name: "xl/worksheets/sheet1.xml", uncompressedSize: 500 * 1024 * 1024 }]);

    expect(() => inspectZip(zip)).toThrow(ZipGuardError);
    expect(() => inspectZip(zip)).toThrow(/grande demais/i);
  });

  it("recusa arquivo com macro (vbaProject.bin)", () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", uncompressedSize: 10 },
      { name: "xl/vbaProject.bin", uncompressedSize: 10 },
    ]);

    expect(() => inspectZip(zip)).toThrow(/macros/i);
  });

  it("recusa arquivo que não é ZIP", () => {
    expect(() => inspectZip(Buffer.from("isto nao e um zip"))).toThrow(ZipGuardError);
  });

  it("recusa arquivo vazio", () => {
    expect(() => inspectZip(Buffer.alloc(0))).toThrow(ZipGuardError);
  });
});
