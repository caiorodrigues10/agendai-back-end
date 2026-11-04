/**
 * Gera as fixtures da importação (um exemplo + um caso hostil por formato).
 *
 *   node scripts/generate-import-fixtures.mjs
 *   node scripts/generate-import-fixtures.mjs --only=hostil-pdf-sem-texto.pdf
 *
 * Os arquivos ficam em `src/modules/dataImport/utils/fixtures/` e são lidos
 * pelos testes. Todos os dados são fictícios.
 *
 * Por que um script e não binários no repositório: os formatos são gerados
 * pelo mesmo código que os valida (assim o teste não depende de um arquivo
 * que ninguém sabe reproduzir), e o script deixa claro o que cada fixture é.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import * as XLSX from "@e965/xlsx";
import PDFDocument from "pdfkit";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "modules", "dataImport", "utils", "fixtures");

const HEADERS = ["Nome", "WhatsApp", "Valor", "Data"];
const ROWS = [
  ["Ana Souza", "11987654321", "1.234,56", "01/02/2026"],
  ["Bruno Lima", "11988887777", "99,90", "05/03/2026"],
  ["Carla Dias", "11977776666", "1.000,00", "10/04/2026"],
];

async function xlsxBuffer({ headerRow = 1, extraRows = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  if (headerRow > 1) {
    ws.addRow(["Relatório de clientes — abril de 2026"]);
    ws.addRow([]);
  }
  ws.addRow(HEADERS);
  for (const row of ROWS) ws.addRow(row);
  for (const row of extraRows) ws.addRow(row);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function xlsmBuffer() {
  // .xlsm é um .xlsx com a parte de macro (xl/vbaProject.bin). A importação
  // NUNCA executa a macro — só ignora a parte.
  const zip = await JSZip.loadAsync(await xlsxBuffer());
  zip.file(
    "xl/vbaProject.bin",
    Buffer.from("macropseudobinario-que-nunca-e-executado", "utf8")
  );
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function odsBuffer() {
  const zip = new JSZip();
  zip.file(
    "mimetype",
    "application/vnd.oasis.opendocument.spreadsheet",
    { compression: "STORE" }
  );
  const cell = (value) =>
    `<table:table-cell office:value-type="string"><text:p>${value}</text:p></table:table-cell>`;
  const rows = [HEADERS, ...ROWS]
    .map(
      (row) =>
        `<table:table-row>${row.map((value) => cell(value)).join("")}</table:table-row>`
    )
    .join("");
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:spreadsheet>
    <table:table table:name="Clientes">${rows}</table:table>
  </office:spreadsheet></office:body>
</office:document-content>`
  );
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
</manifest:manifest>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function xlsBuffer({ abas = 1 } = {}) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]);
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  if (abas > 1) {
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Serviço", "Preço", "Duração"],
      ["Corte Teste", "50,00", "30"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, "Serviços");
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "biff8" }));
}

/**
 * `.xls` que MENTE sobre o tamanho: o cabeçalho OLE2 declara 16 milhões de
 * setores de FAT (≈ 8 GB) num arquivo de poucos KB.
 */
function xlsTamanhoFalsoBuffer() {
  const buffer = xlsBuffer();
  const copia = Buffer.from(buffer);
  // Offset 44 do cabeçalho OLE2: número de setores da FAT (4 bytes, LE).
  copia.writeUInt32LE(0x00ffffff, 44);
  return copia;
}

/** `.xls` com fórmula: só o valor em cache (nunca a fórmula). */
function xlsFormulaBuffer() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nome", "WhatsApp", "Total"],
    ["Ana Souza", "11987654321", 0],
    ["Bruno Lima", "11988887777", 0],
  ]);
  ws.C2 = { t: "n", v: 42, f: "SUM(Sheet1!A1:A10)" };
  ws.C3 = { t: "n", v: 7, f: "'[externo.xlsx]Planilha'!A1" };
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "biff8" }));
}

/**
 * `.xls` com data em serial do Excel (número cru): o leitor entrega o número
 * e a normalização do importador é quem converte.
 *
 * A fixture guarda só o número (45900 e 45901). A data correspondente é
 * calculada no teste — a fixture não presume data nenhuma.
 */
function xlsDataSerialBuffer() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nome", "Data"],
    ["Ana Souza", 45900],
    ["Bruno Lima", 45901],
  ]);
  // Formato de data do Excel: o número continua serial na leitura.
  ws.B2.z = "dd/mm/yyyy";
  ws.B3.z = "dd/mm/yyyy";
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "biff8" }));
}

/** `.xlsx` com células mescladas (o valor fica só na célula mestra). */
async function xlsxMescladoBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["Nome", "WhatsApp", "Valor", "Data"]);
  ws.addRow(["Ana Souza", "11987654321", "1.234,56", "01/02/2026"]);
  ws.mergeCells("A2:A3");
  ws.mergeCells("B2:B3");
  ws.addRow([null, null, "99,90", "05/03/2026"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * `.xlsx`/`.xlsm` com fórmula e link externo.
 *
 * A fórmula NÃO é avaliada (entra o valor em cache) e o link externo NUNCA é
 * resolvido (nenhuma requisição de rede).
 */
async function xlsxFormulaELinkBuffer({ macro = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["Nome", "WhatsApp", "Total", "Site"]);
  ws.addRow(["Ana Souza", "11987654321", null, null]);
  ws.getCell("C2").value = { formula: "SUM(Sheet1!A1:A10)", result: 42 };
  ws.getCell("C3").value = { formula: "'[externo.xlsx]Planilha'!A1", result: 7 };
  ws.getCell("D2").value = {
    text: "Ver site",
    hyperlink: "https://exemplo.invalido/planilha",
  };
  ws.getCell("D3").value = {
    text: "Ver site externo",
    hyperlink: "https://exemplo.invalido/externo",
  };
  const buffer = await wb.xlsx.writeBuffer();
  if (!macro) return Buffer.from(buffer);

  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  zip.file("xl/vbaProject.bin", Buffer.from("macro-ignorada", "utf8"));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** `.ods` com fórmula e link externo (o texto é o valor em cache). */
async function odsFormulaELinkBuffer() {
  const zip = new JSZip();
  zip.file(
    "mimetype",
    "application/vnd.oasis.opendocument.spreadsheet",
    { compression: "STORE" }
  );
  const cell = (value, extra = "") =>
    `<table:table-cell office:value-type="string"${extra}><text:p>${value}</text:p></table:table-cell>`;
  const linkCell = (label, href) =>
    `<table:table-cell office:value-type="string"><text:p><text:a xlink:href="${href}">${label}</text:a></text:p></table:table-cell>`;
  const formulaCell = (value, formula) =>
    `<table:table-cell table:formula="${formula}" office:value-type="float" office:value="${value}"><text:p>${value}</text:p></table:table-cell>`;
  const rows = [
    `<table:table-row>${cell("Nome")}${cell("WhatsApp")}${cell("Total")}${cell("Site")}</table:table-row>`,
    `<table:table-row>${cell("Ana Souza")}${cell("11987654321")}${formulaCell("42", "of:=SUM([.A1:.A10])")}${linkCell("Ver site", "https://exemplo.invalido/planilha")}</table:table-row>`,
    `<table:table-row>${cell("Bruno Lima")}${cell("11988887777")}${formulaCell("7", "of:=['externo.ods'.Planilha.A1]")}${linkCell("Ver site externo", "https://exemplo.invalido/externo")}</table:table-row>`,
  ].join("");
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <office:body><office:spreadsheet>
    <table:table table:name="Clientes">${rows}</table:table>
  </office:spreadsheet></office:body>
</office:document-content>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** `.ods` com duas abas (multi-aba em OpenDocument). */
async function odsDuasAbasBuffer() {
  const zip = await JSZip.loadAsync(await odsBuffer());
  const conteudo = await zip.file("content.xml").async("string");
  const segunda = `<table:table table:name="Serviços"><table:table-row><table:table-cell office:value-type="string"><text:p>Serviço</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Preço</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>Corte Teste</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>50,00</text:p></table:table-cell></table:table-row></table:table>`;
  zip.file(
    "content.xml",
    conteudo.replace("</office:spreadsheet>", `${segunda}</office:spreadsheet>`)
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * `.ods` com células mescladas: a célula mestra tem o valor e a coberta
 * (`table:covered-table-cell`) é a continuação vazia da mescla.
 */
async function odsCelulasMescladasBuffer() {
  const zip = new JSZip();
  zip.file(
    "mimetype",
    "application/vnd.oasis.opendocument.spreadsheet",
    { compression: "STORE" }
  );
  const cell = (value) =>
    `<table:table-cell office:value-type="string"><text:p>${value}</text:p></table:table-cell>`;
  const master = (value) =>
    `<table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>${value}</text:p></table:table-cell>`;
  const rows = [
    `<table:table-row>${cell("Nome")}${cell("WhatsApp")}${cell("Valor")}${cell("Data")}</table:table-row>`,
    `<table:table-row>${master("Ana Souza")}<table:covered-table-cell/>${cell("1.234,56")}${cell("01/02/2026")}</table:table-row>`,
    `<table:table-row>${cell("Bruno Lima")}${cell("11988887777")}${cell("99,90")}${cell("05/03/2026")}</table:table-row>`,
  ].join("");
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:spreadsheet>
    <table:table table:name="Clientes">${rows}</table:table>
  </office:spreadsheet></office:body>
</office:document-content>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** PDF com 12 páginas (o limite do importador é 10). */
async function pdfMuitasPaginasBuffer(paginas = 12) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  for (let i = 1; i <= paginas; i += 1) {
    doc.text(`Página ${i}`, 40, 40);
    if (i < paginas) doc.addPage();
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

/**
 * PDF que declara um objeto gigante (`/Length 999999999`) num arquivo de
 * poucos KB: a guarda tem de recusar pelo valor declarado, sem descompactar.
 */
function pdfObjetoGiganteBuffer() {
  const objetos = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 999999999 >>\nstream\nBT ET\nendstream\nendobj\n",
  ];
  const pdf = `%PDF-1.7\n${objetos.join("")}trailer\n<< /Size 5 /Root 1 0 R >>\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function pdfBuffer({ withText = true } = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on("end", resolve));
  doc.fontSize(12);
  if (withText) {
    // Cada célula é desenhada numa posição X fixa — é assim que uma tabela
    // de verdade sai de um PDF (e é o que permite reconstruir as colunas).
    const columns = [40, 200, 320, 420];
    doc.text("Clientes", 40, 40);
    let y = 80;
    HEADERS.forEach((header, index) => doc.text(header, columns[index], y));
    y += 20;
    for (const row of ROWS) {
      row.forEach((cell, index) => doc.text(cell, columns[index], y));
      y += 20;
    }
  } else {
    // PDF "escaneado": só imagem, sem texto selecionável.
    //
    // A imagem entra como XObject (doc.image) e NÃO como bytes soltos no
    // content stream: PNG cru no stream é interpretado pelo pdf.js como
    // operadores ("PNG", "IHDR", "IEND"...) e ele despeja
    // "Warning: Unknown command" na saída dos testes.
    doc.image(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      ),
      40,
      40,
      { width: 200, height: 200 }
    );
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

async function zipBombBuffer(kind = "xlsx") {
  // 70 MB de zeros: o ZIP é pequeno, mas declara 70 MB descomprimidos.
  // A guarda tem de recusar pelo diretório central, sem descompactar.
  // O ZIP é uma planilha de verdade por fora (senão a detecção recusaria
  // antes da guarda — e a guarda nunca seria exercitada).
  const zip = new JSZip();
  if (kind === "ods") {
    zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet", {
      compression: "STORE",
    });
    zip.file("content.xml", "<office:document-content/>");
  } else {
    zip.file("xl/workbook.xml", "<workbook/>");
  }
  zip.file("xl/worksheets/sheet1.xml", Buffer.alloc(70 * 1024 * 1024));
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

async function odsSemContentBuffer() {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet", {
    compression: "STORE",
  });
  zip.file("content.xml.txt", "isto não é o content.xml do OpenDocument");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function odsDeTextoBuffer() {
  // OpenDocument **de texto** (o .odt): tem content.xml, mas não é planilha.
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", {
    compression: "STORE",
  });
  zip.file(
    "content.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
<office:body><office:text><text:p>isto é um documento de texto, não uma planilha</text:p></office:text></office:body>
</office:document-content>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function xlsbBuffer() {
  // .xlsb é um ZIP de workbook binário: nem planilha OOXML, nem OpenDocument.
  const zip = new JSZip();
  zip.file("xl/workbook.bin", Buffer.from("workbook-binario"));
  zip.file("[Content_Types].xml", "<?xml version=\"1.0\"?><Types/>");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function oled2InvalidoBuffer() {
  // Cabeçalho OLE2 válido, conteúdo que não é workbook.
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return Buffer.concat([header, Buffer.alloc(2048, 0x41)]);
}

function csvBuffer() {
  return Buffer.from(
    [HEADERS, ...ROWS].map((row) => row.join(",")).join("\n"),
    "utf8"
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const files = {
    // exemplos
    "exemplo-clientes.xlsx": await xlsxBuffer(),
    "exemplo-clientes.xlsm": await xlsmBuffer(),
    "exemplo-clientes.ods": await odsBuffer(),
    "exemplo-clientes.xls": xlsBuffer(),
    "exemplo-clientes.pdf": await pdfBuffer({ withText: true }),
    "exemplo-clientes.tsv": Buffer.from(
      [HEADERS, ...ROWS].map((row) => row.join("\t")).join("\n"),
      "utf8"
    ),
    "exemplo-clientes.txt": Buffer.from(
      [HEADERS, ...ROWS].map((row) => row.join("|")).join("\n"),
      "utf8"
    ),
    // exemplos da Fase 1: multi-aba, mescla, serial de data
    "exemplo-clientes-2abas.xls": xlsBuffer({ abas: 2 }),
    "exemplo-clientes-2abas.ods": await odsDuasAbasBuffer(),
    "exemplo-celulas-mescladas.xlsx": await xlsxMescladoBuffer(),
    "exemplo-celulas-mescladas.ods": await odsCelulasMescladasBuffer(),
    "exemplo-data-serial.xls": xlsDataSerialBuffer(),
    "exemplo-formula.xls": xlsFormulaBuffer(),
    // hostis
    "hostil-zipbomb.xlsx": await zipBombBuffer("xlsx"),
    "hostil-zipbomb.ods": await zipBombBuffer("ods"),
    "hostil-macro.xlsm": await xlsmBuffer(),
    "hostil-ods-sem-content.ods": await odsSemContentBuffer(),
    "hostil-ods-texto.ods": await odsDeTextoBuffer(),
    "hostil-xls-invalido.xls": oled2InvalidoBuffer(),
    "hostil-xlsb.xlsb": await xlsbBuffer(),
    "hostil-pdf-sem-texto.pdf": await pdfBuffer({ withText: false }),
    "hostil-pdf-muitas-paginas.pdf": await pdfMuitasPaginasBuffer(12),
    "hostil-pdf-objeto-gigante.pdf": pdfObjetoGiganteBuffer(),
    "hostil-xls-tamanho-falso.xls": xlsTamanhoFalsoBuffer(),
    "hostil-formula-externa.xlsx": await xlsxFormulaELinkBuffer(),
    "hostil-formula-externa.xlsm": await xlsxFormulaELinkBuffer({ macro: true }),
    "hostil-formula-externa.ods": await odsFormulaELinkBuffer(),
    "hostil-binario.tsv": Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xff, 0x00]),
    "hostil-binario.txt": Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xff, 0x00]),
    // extensão mentirosa: o CONTEÚDO manda, não o nome
    "hostil-extensao-falsa.csv": await xlsxBuffer(),
    "hostil-extensao-falsa.xlsx": csvBuffer(),
    "hostil-cabecalho-2a-linha.xlsx": await xlsxBuffer({ headerRow: 3 }),
    "hostil-linha-de-total.xlsx": await xlsxBuffer({
      extraRows: [
        ["TOTAL", "", "2.334,46", ""],
        ["Gerado em 01/05/2026", "", "", ""],
      ],
    }),
  };

  // `--only=<nome>` regenera uma fixture só (sem mexer nas outras).
  const only = process.argv
    .find((arg) => arg.startsWith("--only="))
    ?.slice("--only=".length);

  for (const [name, buffer] of Object.entries(files)) {
    if (only && name !== only) continue;
    await writeFile(join(OUT, name), buffer);
    console.log(`${name.padEnd(34)} ${buffer.length} bytes`);
  }
}

await main();
