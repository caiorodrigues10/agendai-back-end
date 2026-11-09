import { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { container } from "tsyringe";
import { pageThemeIdParamsSchema } from "../../schemas/pageThemeSchemas";
import {
  GetSalonShareHtmlUseCase,
  shareNotFoundHtml,
} from "./GetSalonShareHtmlUseCase";
import { resolvePublicApiUrl, resolvePublicAppUrl } from "./shareUrls";

/** Cache da página de compartilhamento (meta tags não mudam a cada visita). */
const SHARE_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=60";

/** 404 curto: evita um crawler indexar a URL morta. */
const NOT_FOUND_CACHE_CONTROL = "public, max-age=60";

export class ShareSalonController {
  /** GET /s/salon/:id — HTML com meta tags OG/Twitter + redirect para o app. */
  async render(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = pageThemeIdParamsSchema.parse(request.params);
    const useCase = container.resolve(GetSalonShareHtmlUseCase);
    const page = await useCase.execute({
      id,
      publicAppUrl: resolvePublicAppUrl(request),
      apiOrigin: resolvePublicApiUrl(request),
    });

    if (!page) {
      reply
        .code(404)
        .type("text/html; charset=utf-8")
        .header("Cache-Control", NOT_FOUND_CACHE_CONTROL)
        .send(shareNotFoundHtml());
      return;
    }

    const etag = `W/"${createHash("sha1").update(page.html).digest("base64url")}"`;
    reply
      .type("text/html; charset=utf-8")
      .header("ETag", etag)
      .header("Cache-Control", SHARE_CACHE_CONTROL);

    if (request.headers["if-none-match"] === etag) {
      reply.code(304).send();
      return;
    }

    reply.send(page.html);
  }
}
