import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";

export const FONT_FAMILY = "Open Sans";

export function resolvePostFontFile(): string | null {
  const here = typeof __dirname !== "undefined" ? __dirname : process.cwd();
  const candidates = [
    path.join(here, "../fonts/OpenSans-Bold.ttf"),
    // cobre o bundle do worker (dist/shared/infra/worker), onde o renderer
    // é embutido e __dirname deixa de apontar para a pasta do serviço
    path.join(here, "../../../modules/posts/fonts/OpenSans-Bold.ttf"),
    path.join(process.cwd(), "src/modules/posts/fonts/OpenSans-Bold.ttf"),
    path.join(process.cwd(), "dist/modules/posts/fonts/OpenSans-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/**
 * Render SVG → PNG (Resvg + fonte empacotada).
 *
 * Decisão (B24): é síncrono e CPU-bound, portanto só deve rodar dentro do
 * worker thread do pool (`shared/infra/worker/postRenderPool`). Manter a
 * renderização em um único arquivo garante que worker e qualquer caminho
 * de fallback produzam exatamente os mesmos bytes de PNG.
 */
export function renderSvgToPngSync(svg: string): Buffer {
  const fontFile = resolvePostFontFile();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontFiles: fontFile ? [fontFile] : [],
      loadSystemFonts: true,
      defaultFontFamily: FONT_FAMILY,
    },
  });
  return resvg.render().asPng();
}
