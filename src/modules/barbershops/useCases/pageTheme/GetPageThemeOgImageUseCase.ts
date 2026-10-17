import { inject, injectable } from "tsyringe";
import sharp from "sharp";
import { AppError } from "@/shared/errors/AppError";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Quebra o nome em linhas de no máximo `maxChars` para o cartão OG. */
function wrapName(name: string, maxChars = 18): string[] {
  const words = name.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Gera o cartão Open Graph (1200×630 PNG) da página pública do salão a partir
 * do tema salvo (cores) e do nome do salão. Serve a SPA quando o compartilhamento
 * precisa de imagem dinâmica sem SSR (crawlers que executam JS também pegam o
 * meta og:image via SeoHead).
 */
@injectable()
export class GetPageThemeOgImageUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
  ) {}

  async execute(barbershopId: string): Promise<Buffer> {
    const shop = await this.barbershopRepository.findByIdPublic(barbershopId);
    if (!shop) {
      throw new AppError("Salão não encontrado", 404);
    }

    const theme: IPageThemeDTO | null = await this.barbershopRepository.findPageTheme(barbershopId);
    const bg = theme?.backgroundColor ?? PAGE_THEME_DEFAULTS.backgroundColor;
    const accent = theme?.accentColor ?? PAGE_THEME_DEFAULTS.accentColor;
    const text = theme?.textColor ?? PAGE_THEME_DEFAULTS.textColor;
    const muted = theme?.textMutedColor ?? PAGE_THEME_DEFAULTS.textMutedColor;

    const lines = wrapName(shop.name || "Salão");
    const startY = OG_HEIGHT / 2 - ((lines.length - 1) * 72) / 2;
    const textSpans = lines
      .map(
        (line, i) =>
          `<text x="600" y="${startY + i * 72}" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="${escapeXml(text)}">${escapeXml(line)}</text>`,
      )
      .join("");

    const svg = `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${escapeXml(bg)}"/>
  <rect x="0" y="${OG_HEIGHT - 12}" width="${OG_WIDTH}" height="12" fill="${escapeXml(accent)}"/>
  ${textSpans}
  <text x="600" y="${OG_HEIGHT - 56}" text-anchor="middle" font-family="sans-serif" font-size="28" fill="${escapeXml(muted)}">Agende pelo Agenda Já</text>
</svg>`;

    return sharp(Buffer.from(svg))
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
}
