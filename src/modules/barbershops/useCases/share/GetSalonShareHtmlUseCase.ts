import { inject, injectable } from "tsyringe";
import { BRAND_NAME } from "@/config/brand";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import type { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { buildCoverOgUrl, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "../../utils/coverOgUrl";

export interface SharePageInput {
  id: string;
  /** Origem pública do app (env `PUBLIC_APP_URL`): canonical, og:url e redirect. */
  publicAppUrl: string;
  /**
   * Base da API para o `og:image` sem capa (env `PUBLIC_API_URL`, ou a origem
   * da requisição fora de produção). Vazia em produção sem env → sem `og:image`
   * (URL interna nunca vira URL de preview).
   */
  apiOrigin: string;
}

export interface SharePageResult {
  html: string;
}

/** Escapa texto colocado em atributo/elemento HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pageTitle(shop: IBarbershopResponseDTO): string {
  const name = shop.name?.trim();
  return name ? name : "Salão";
}

function pageDescription(shop: IBarbershopResponseDTO, title: string): string {
  const city = shop.city?.trim();
  const where = city ? ` em ${city}` : "";
  return `${title}${where} — agenda, serviços e publicações.`;
}

/**
 * Página servida em `GET /s/salon/:id`: meta tags (Open Graph/Twitter), um
 * `meta refresh` e um corpo mínimo acessível (fundo escuro, `<main>`, texto e
 * link visível) para quem está sem meta refresh ou sem JS — nenhum `<script>`
 * inline, porque a CSP de produção do back não tem `unsafe-inline`.
 *
 * Retorna `null` quando o salão não existe ou está inativo (404).
 */
@injectable()
export class GetSalonShareHtmlUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
  ) {}

  async execute(input: SharePageInput): Promise<SharePageResult | null> {
    const shop = await this.barbershopRepository.findByIdPublic(input.id);
    if (!shop || !shop.active) return null;

    const theme = await this.barbershopRepository.findPageTheme(input.id);
    const ogImage = theme?.coverUrl
      ? buildCoverOgUrl(theme.coverUrl, {
          focalX: theme.coverFocalX,
          focalY: theme.coverFocalY,
          originalWidth: theme.coverWidth,
          originalHeight: theme.coverHeight,
        })
      : input.apiOrigin
        ? `${input.apiOrigin}/api/barbershops/${input.id}/page-theme/og-image`
        : "";

    const canonical = `${input.publicAppUrl}/s/salon/${input.id}`;
    const appUrl = `${input.publicAppUrl}/queue/${encodeURIComponent(input.id)}?tab=profile`;
    const title = pageTitle(shop);
    const description = pageDescription(shop, title);

    const ogImageTags = ogImage
      ? `
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">
<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">`
      : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | ${escapeHtml(BRAND_NAME)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(BRAND_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">${ogImageTags}
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}">
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center">
<main style="padding:32px 24px;max-width:36rem">
<h1 style="margin:0 0 8px;font-size:1.25rem;font-weight:600;color:#f8fafc">Abrindo o perfil...</h1>
<p style="margin:0 0 20px;color:#9ca3af">Se não abrir automaticamente, use o link abaixo.</p>
<p style="margin:0"><a href="${escapeHtml(appUrl)}" style="color:#7dd3fc;font-size:1.125rem;font-weight:600">Abrir ${escapeHtml(title)} no ${escapeHtml(BRAND_NAME)}</a></p>
</main>
</body>
</html>`;

    return { html };
  }
}

/** Página 404 da rota de compartilhamento (sem cache longo: sem `index, follow`). */
export function shareNotFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salão não encontrado | ${escapeHtml(BRAND_NAME)}</title>
<meta name="robots" content="noindex, nofollow">
</head>
<body>
<p>Salão não encontrado.</p>
</body>
</html>`;
}
