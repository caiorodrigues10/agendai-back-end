/**
 * Registry de fontes do motor — TTF estáticos OFL, carregados 1× (lazy).
 *
 * O "frio" do satori (parse de fontes, ~1,4 s) é pago uma única vez quando o
 * registry é populado; depois todos os renders são "quentes". Cada worker thread
 * tem o seu próprio registry (singleton por processo/thread).
 */
import fs from "node:fs";
import path from "node:path";

export type FontWeight = 400 | 500 | 700 | 800 | 900;

export type EngineFont = {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
};

const FONT_DIR_CANDIDATES = [
  // dev (src) — e o bundle do worker compilado (shared/infra/worker → raiz)
  path.join(__dirname, "..", "assets", "fonts"),
  // bundle compilado do worker: dist/shared/infra/worker → dist/…
  path.join(__dirname, "..", "..", "..", "modules", "posts", "templates", "assets", "fonts"),
  // build (dist) — assets copiados pelo tsup onSuccess
  path.join(process.cwd(), "dist", "modules", "posts", "templates", "assets", "fonts"),
  path.join(process.cwd(), "src", "modules", "posts", "templates", "assets", "fonts"),
];

const FAMILY_FILES: Record<string, Array<{ file: string; weight: FontWeight }>> = {
  Montserrat: [
    { file: "Montserrat-ExtraBold.ttf", weight: 800 },
    { file: "Montserrat-Black.ttf", weight: 900 },
  ],
  Inter: [
    { file: "Inter-Regular.ttf", weight: 400 },
    { file: "Inter-Medium.ttf", weight: 500 },
    { file: "Inter-Bold.ttf", weight: 700 },
  ],
};

let cache: EngineFont[] | null = null;

function resolveFontDir(): string {
  const dir = FONT_DIR_CANDIDATES.find((c) => fs.existsSync(c));
  if (!dir) {
    throw new Error(`Diretório de fontes do motor não encontrado. Candidatos: ${FONT_DIR_CANDIDATES.join(", ")}`);
  }
  return dir;
}

/** Carrega todas as fontes do motor 1×. Chamadas seguintes reutilizam o cache. */
export function getEngineFonts(): EngineFont[] {
  if (cache) return cache;
  const dir = resolveFontDir();
  const fonts: EngineFont[] = [];
  for (const [family, entries] of Object.entries(FAMILY_FILES)) {
    for (const { file, weight } of entries) {
      const buf = fs.readFileSync(path.join(dir, file));
      fonts.push({
        name: family,
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      });
    }
  }
  cache = fonts;
  return fonts;
}

/** Fontes já carregadas? (para métricas de "frio por worker"). */
export function fontsWarm(): boolean {
  return cache !== null;
}
