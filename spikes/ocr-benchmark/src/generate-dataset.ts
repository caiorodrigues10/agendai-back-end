/**
 * Gera o dataset sintético do spike: N imagens de uma tabela de clientes
 * (nome / telefone / valor) degradadas de formas diferentes, com o ground
 * truth de cada célula.
 *
 * As degradações simulam o que chega de verdade pelo WhatsApp: foto de
 * tela, print comprimido, papel escaneado torto, JPEG de WhatsApp.
 *
 * Saída:
 *   dataset/images/<id>.png   — a imagem
 *   dataset/ground-truth.json  — as células esperadas de cada imagem
 */
import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const OUT = path.resolve(__dirname, "..", "dataset");
const IMAGES_DIR = path.join(OUT, "images");
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";

const NOMES = [
  "Ana Beatriz Nogueira",
  "Carlos Eduardo Ramos",
  "Fernanda Lopes Martins",
  "Marcos Vinícius Alves",
  "Juliana Prado Ferreira",
  "Rafael Monteiro Dias",
  "Patrícia Nogueira Rocha",
  "Thiago Barbosa Cardoso",
  "Camila Rezende Pinheiro",
  "Bruno Siqueira Castro",
  "Larissa Fontes Duarte",
  "Otávio Bandeira Melo",
  "Renata Coelho Amaral",
  "Igor Valença Machado",
  "Sabrina Távora Cunha",
  "Diego Antunes Farias",
];

const DDD = ["11", "21", "31", "41", "48", "51", "61", "71", "81", "85"];
const VALORES = [
  "250,00", "1.480,50", "89,90", "3.200,00", "47,35", "12.900,00",
  "675,40", "99,99", "1.250,75", "38,00", "5.430,10", "210,00",
];

interface GroundTruthRow {
  nome: string;
  telefone: string;
  valor: string;
}

interface ImageCase {
  id: string;
  degradation: string;
  /** Estrutura da tabela (baseline = como nas imagens 1–36). */
  estrutura: string;
  rows: GroundTruthRow[];
}

/** PRNG determinístico (mulberry32) — o dataset é reprodutível. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function makeRows(rng: () => number, count: number): GroundTruthRow[] {
  const rows: GroundTruthRow[] = [];
  const usados = new Set<string>();
  for (let i = 0; i < count; i++) {
    let nome = pick(rng, NOMES);
    let tentativas = 0;
    while (usados.has(nome) && tentativas++ < 20) nome = pick(rng, NOMES);
    usados.add(nome);
    const ddd = pick(rng, DDD);
    const numero = String(9_000_000 + Math.floor(rng() * 999_999)).padStart(8, "0");
    rows.push({
      nome,
      telefone: `${ddd}${numero}`,
      valor: pick(rng, VALORES),
    });
  }
  return rows;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&#38;")
    .replace(/</g, "&#60;")
    .replace(/>/g, "&#62;")
    .replace(/"/g, "&#34;");
}

interface SvgOptions {
  fontSize: number;
  width: number;
  /** Grade completa (linhas verticais e horizontais). */
  grid?: boolean;
  /** Sem nenhuma linha (nem o sublinhado do cabeçalho). */
  semLinhas?: boolean;
  /** Linha TOTAL no rodapé (não entra no ground truth). */
  totalValor?: string;
}

/** Monta o SVG da tabela com 3 colunas alinhadas. */
function buildSvg(rows: GroundTruthRow[], opts: SvgOptions): string {
  const { fontSize, width, grid, semLinhas, totalValor } = opts;
  const colNome = 30;
  const colFone = Math.round(width * 0.45);
  const colValor = Math.round(width * 0.75);
  const alturaLinha = Math.round(fontSize * 2);
  const marginTop = Math.round(fontSize * 2.4);
  const linhasExtras = totalValor ? 1 : 0;
  const altura =
    marginTop + (rows.length + linhasExtras) * alturaLinha + Math.round(fontSize * 1.5);

  const cabecalho = `
    <text x="${colNome}" y="${Math.round(fontSize * 1.6)}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="#111">NOME</text>
    <text x="${colFone}" y="${Math.round(fontSize * 1.6)}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="#111">TELEFONE</text>
    <text x="${colValor}" y="${Math.round(fontSize * 1.6)}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="#111">VALOR</text>
    ${semLinhas ? "" : `<line x1="20" y1="${Math.round(fontSize * 1.95)}" x2="${width - 20}" y2="${Math.round(fontSize * 1.95)}" stroke="#333" stroke-width="2"/>`}`;

  const corpo = rows
    .map((row, i) => {
      const y = marginTop + i * alturaLinha + fontSize;
      return `
    <text x="${colNome}" y="${y}" font-family="Arial" font-size="${fontSize}" fill="#111">${escapeXml(row.nome)}</text>
    <text x="${colFone}" y="${y}" font-family="Arial" font-size="${fontSize}" fill="#111">${escapeXml(row.telefone)}</text>
    <text x="${colValor}" y="${y}" font-family="Arial" font-size="${fontSize}" fill="#111">R$ ${escapeXml(row.valor)}</text>`;
    })
    .join("");

  const rodape = totalValor
    ? (() => {
        const y = marginTop + rows.length * alturaLinha + fontSize;
        return `
    <text x="${colNome}" y="${y}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="#111">TOTAL</text>
    <text x="${colValor}" y="${y}" font-family="Arial" font-size="${fontSize}" font-weight="bold" fill="#111">R$ ${escapeXml(totalValor)}</text>`;
      })()
    : "";

  // Grade completa: verticais nas bordas das colunas e horizontais por linha.
  let grade = "";
  if (grid) {
    const topo = Math.round(fontSize * 0.6);
    const base = marginTop + (rows.length + linhasExtras) * alturaLinha - Math.round(fontSize * 0.5);
    const xs = [18, colFone - 10, colValor - 10, width - 18];
    grade = xs
      .map((x) => `<line x1="${x}" y1="${topo}" x2="${x}" y2="${base}" stroke="#888" stroke-width="1"/>`)
      .join("");
    for (let i = 0; i <= rows.length + linhasExtras; i++) {
      const y = marginTop + i * alturaLinha - Math.round(fontSize * 0.5);
      grade += `<line x1="18" y1="${y}" x2="${width - 18}" y2="${y}" stroke="#888" stroke-width="1"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${altura}">
  <rect width="${width}" height="${altura}" fill="#ffffff"/>
  ${grade}${cabecalho}${corpo}${rodape}
</svg>`;
}

function renderSvg(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: [FONT, FONT_BOLD],
      loadSystemFonts: true,
      defaultFontFamily: "Arial",
    },
  });
  return resvg.render().asPng();
}

/** Aplica a degradação da cena no PNG renderizado. */
async function degrade(png: Buffer, degradation: string): Promise<Buffer> {
  let img = sharp(png);
  switch (degradation) {
    case "print-limpo":
      return img.png().toBuffer();

    case "jpeg-whatsapp": {
      // WhatsApp recomprime com qualidade baixa.
      return img.jpeg({ quality: 55 }).toBuffer();
    }

    case "foto-escurecida": {
      // Foto de papel: contraste baixo, brilho menor, leve ruído.
      return img
        .modulate({ brightness: 0.92, saturation: 0.7 })
        .jpeg({ quality: 72 })
        .toBuffer();
    }

    case "baixa-resolucao": {
      // Print shrunk: metade da resolução, depois o OCR tem que ampliar.
      const meta = await img.metadata();
      const small = await img
        .resize(Math.round((meta.width ?? 800) / 2.2), Math.round((meta.height ?? 600) / 2.2))
        .png()
        .toBuffer();
      return sharp(small).jpeg({ quality: 70 }).toBuffer();
    }

    case "torta": {
      // Papel escaneado torto (~2 graus).
      return img.rotate(2.1, { background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
    }

    case "ruido": {
      const meta = await img.metadata();
      const w = meta.width ?? 800;
      const h = meta.height ?? 600;
      const raw = await img.raw().toBuffer();
      const out = Buffer.from(raw);
      for (let i = 0; i < out.length; i += 1) {
        const n = (Math.random() - 0.5) * 26;
        const v = out[i] + n;
        out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      return sharp(out, { raw: { width: w, height: h, channels: 3 } })
        .jpeg({ quality: 82 })
        .toBuffer();
    }

    default:
      return img.png().toBuffer();
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const DEGRADACOES = [
    "print-limpo",
    "jpeg-whatsapp",
    "foto-escurecida",
    "baixa-resolucao",
    "torta",
    "ruido",
  ];

  const rng = makeRng(20261101);
  const cases: ImageCase[] = [];

  // 36 imagens: 6 degradações × 6 variações de conteúdo/layout.
  for (let d = 0; d < DEGRADACOES.length; d++) {
    for (let v = 0; v < 6; v++) {
      const id = `caso-${String(d * 6 + v + 1).padStart(2, "0")}-${DEGRADACOES[d]}`;
      const fontSize = 20 + (v % 3) * 3;
      const width = 900 + (v % 2) * 120;
      const rows = makeRows(rng, 6 + (v % 2));
      const svg = buildSvg(rows, { fontSize, width });
      const png = renderSvg(svg);
      const degraded = await degrade(png, DEGRADACOES[d]);
      const file = path.join(IMAGES_DIR, `${id}.jpg`);
      fs.writeFileSync(file, degraded);
      cases.push({ id, degradation: DEGRADACOES[d], estrutura: "baseline", rows });
      console.log(`${id}: ${rows.length} linhas`);
    }
  }

  // --- Estruturas adicionais (37–66): o que muda é a tabela, não a
  // degradação. Todas com qualidade de print para isolar o efeito.
  const NOMES_ACENTOS = [
    "José Ângelo Conceição",
    "Íris Gonçalves Assunção",
    "Wagner Luís Coelho",
    "Lívia Ferreira Nunes",
    "Antônio José da Silva",
    "Márcia Letícia Peçanha",
    "Célio Araújo Siqueira",
    "Bárbara Cristóvão",
    "Ubiratã Mendonça",
    "Débora Régis Lima",
    "Ítalo Guimarães",
    "Vera Lúcia Bráz",
  ];

  function mascaraTelefone(digitos: string, variacao: number): string {
    const ddd = digitos.slice(0, 2);
    const resto = digitos.slice(2);
    const p1 = resto.slice(0, 5);
    const p2 = resto.slice(5);
    switch (variacao % 6) {
      case 0:
        return `(${ddd}) ${p1}-${p2}`;
      case 1:
        return `${ddd} ${p1.slice(0, 1)} ${p1.slice(1)}-${p2}`;
      case 2:
        return `+55 ${ddd} ${p1}-${p2}`;
      case 3:
        return `${ddd}${p1}${p2}`;
      case 4:
        return `0${ddd} ${p1}-${p2}`;
      default:
        return `(${ddd})${p1.slice(0, 1)} ${p1.slice(1)}-${p2}`;
    }
  }

  function totalDosValores(rows: GroundTruthRow[]): string {
    const soma = rows.reduce((soma, r) => {
      const [inteiro, decimal] = r.valor.split(",");
      return soma + Number(inteiro.replace(/\./g, "")) + Number(decimal) / 100;
    }, 0);
    const fixo = soma.toFixed(2);
    const [i, d] = fixo.split(".");
    return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
  }

  const ESTRUTURAS: Array<{ nome: string; grid?: boolean; semLinhas?: boolean; total?: boolean }> = [
    { nome: "grade", grid: true },
    { nome: "sem-grade", semLinhas: true },
    { nome: "total", total: true },
    { nome: "acentos" },
    { nome: "mascara" },
  ];

  for (let e = 0; e < ESTRUTURAS.length; e++) {
    const estrutura = ESTRUTURAS[e];
    for (let v = 0; v < 6; v++) {
      const id = `caso-${String(37 + e * 6 + v).padStart(2, "0")}-estrutura-${estrutura.nome}`;
      const fontSize = 20 + (v % 3) * 3;
      const width = 940 + (v % 2) * 120;
      const rows = makeRows(rng, 6 + (v % 2));
      if (estrutura.nome === "acentos") {
        for (let i = 0; i < rows.length; i++) {
          rows[i].nome = NOMES_ACENTOS[(v * 3 + i) % NOMES_ACENTOS.length];
        }
      }
      if (estrutura.nome === "mascara") {
        for (let i = 0; i < rows.length; i++) {
          rows[i].telefone = mascaraTelefone(rows[i].telefone, v + i);
        }
      }
      const svg = buildSvg(rows, {
        fontSize,
        width,
        grid: estrutura.grid,
        semLinhas: estrutura.semLinhas,
        totalValor: estrutura.total ? totalDosValores(rows) : undefined,
      });
      const png = renderSvg(svg);
      const file = path.join(IMAGES_DIR, `${id}.jpg`);
      fs.writeFileSync(file, await sharp(png).jpeg({ quality: 88 }).toBuffer());
      cases.push({
        id,
        degradation: `estrutura-${estrutura.nome}`,
        estrutura: estrutura.nome,
        rows,
      });
      console.log(`${id}: ${rows.length} linhas`);
    }
  }

  fs.writeFileSync(
    path.join(OUT, "ground-truth.json"),
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        descricao:
          "Dataset sintético: tabela de clientes (nome/telefone/valor) renderizada e degradada. " +
          "Ground truth por linha, no formato exato exibido na imagem.",
        colunas: ["nome", "telefone", "valor"],
        naoCoberto: [
          "manuscrito (letra de mão)",
          "PDF escaneado (documento inteiro, várias páginas)",
          "tabela com células mescladas",
          "foto com fundo não branco / sombra forte",
          "duas tabelas na mesma imagem",
        ],
        casos: cases,
      },
      null,
      2
    )
  );
  console.log(`\n${cases.length} imagens em ${IMAGES_DIR}`);
}

void main();
