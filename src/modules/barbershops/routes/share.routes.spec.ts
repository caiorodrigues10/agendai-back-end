/// <reference types="vitest/globals" />
import fastify, { FastifyInstance } from "fastify";
import { container } from "tsyringe";
import { shareRoutes } from "./share.routes";
import type { IBarbershopRepository, IPageThemeDTO } from "../repositories/IBarbershopRepository";
import type { IBarbershopResponseDTO } from "../dtos/IBarbershopResponseDTO";

const ID = "1f9c0a4e-3f3a-4c9b-9f3d-0f2b1a6d7e88";
const COVER = "https://res.cloudinary.com/demo/image/upload/v1700000000/salao/capa.jpg";
const PUBLIC_APP_URL = "https://agendai.example.com";

function shop(overrides: Partial<IBarbershopResponseDTO> = {}): IBarbershopResponseDTO {
  return {
    id: ID,
    name: "Barbearia Central",
    city: "São Paulo",
    active: true,
    operationMode: "APPOINTMENT",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as unknown as IBarbershopResponseDTO;
}

function theme(overrides: Partial<IPageThemeDTO> = {}): IPageThemeDTO {
  return {
    id: "theme-1",
    barbershopId: ID,
    presetKey: null,
    accentColor: "#22c55e",
    backgroundColor: "#0f172a",
    surfaceColor: "#1e293b",
    textColor: "#f8fafc",
    textMutedColor: "#94a3b8",
    radiusStyle: "rounded",
    buttonStyle: "filled",
    mode: "AUTO",
    lightColors: null,
    darkColors: null,
    coverUrl: null,
    coverPublicId: null,
    coverOverlay: 0,
    ...overrides,
  } as unknown as IPageThemeDTO;
}

describe("GET /s/salon/:id", () => {
  let app: FastifyInstance;
  let findByIdPublic: ReturnType<typeof vi.fn>;
  let findPageTheme: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.PUBLIC_APP_URL = PUBLIC_APP_URL;
    findByIdPublic = vi.fn().mockResolvedValue(shop());
    findPageTheme = vi.fn().mockResolvedValue(theme({ coverUrl: COVER }));
    container.register<IBarbershopRepository>("BarbershopRepository", {
      useValue: { findByIdPublic, findPageTheme } as unknown as IBarbershopRepository,
    });
    app = fastify();
    await app.register(shareRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    delete process.env.PUBLIC_APP_URL;
  });

  it("responde HTML com meta tags e cache de 5 minutos", async () => {
    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=300, stale-while-revalidate=60",
    );
    expect(response.headers.etag).toMatch(/^W\/"[^"]+"$/);
    expect(response.body).toContain(`og:url" content="${PUBLIC_APP_URL}/s/salon/${ID}"`);
    expect(response.body).toContain("w_1200,h_630,c_fill,g_auto,f_jpg,q_auto");
    expect(response.body).toContain('<meta http-equiv="refresh"');
  });

  it("sem capa aponta og:image para a rota og-image da API", async () => {
    findPageTheme.mockResolvedValue(theme({ coverUrl: null }));

    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      `og:image" content="http://localhost:80/api/barbershops/${ID}/page-theme/og-image"`,
    );
  });

  it("responde 304 quando o ETag do cliente casa", async () => {
    const first = await app.inject({ method: "GET", url: `/s/salon/${ID}` });
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/s/salon/${ID}`,
      headers: { "if-none-match": etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe("");
    expect(second.headers.etag).toBe(etag);
    expect(second.headers["cache-control"]).toContain("max-age=300");
  });

  it("HEAD devolve os mesmos cabeçalhos sem corpo", async () => {
    const response = await app.inject({ method: "HEAD", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers.etag).toMatch(/^W\/"[^"]+"$/);
    expect(response.headers["cache-control"]).toContain("max-age=300");
    expect(response.body).toBe("");
  });

  it("salão inexistente responde 404 HTML", async () => {
    findByIdPublic.mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Salão não encontrado");
    expect(response.body).toContain('name="robots" content="noindex, nofollow"');
    expect(response.body).not.toContain("<script");
  });

  it("salão inativo responde 404 HTML", async () => {
    findByIdPublic.mockResolvedValue(shop({ active: false }));

    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Salão não encontrado");
  });

  it("id que não é uuid responde 400 (validação de params)", async () => {
    const response = await app.inject({ method: "GET", url: "/s/salon/nao-e-uuid" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false });
    expect(findByIdPublic).not.toHaveBeenCalled();
  });

  it("escapa o nome do salão e não tem <script> no HTML servido", async () => {
    findByIdPublic.mockResolvedValue(
      shop({ name: `Casa do <script>alert("x")</script> & Cia` }),
    );

    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("<script");
    expect(response.body).toContain("&lt;script&gt;");
  });

  it("corpo mínimo e acessível: texto, link visível e fundo escuro, sem script", async () => {
    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<html lang="pt-BR">');
    expect(response.body).toContain("<main");
    expect(response.body).toContain(">Abrindo o perfil...</h1>");
    expect(response.body).toContain("background:#0b1220");
    expect(response.body).toContain(
      `href="${PUBLIC_APP_URL}/queue/${encodeURIComponent(ID)}?tab=profile"`,
    );
    expect(response.body).not.toContain("<script");
    expect(response.body).not.toContain("onclick");
  });

  it("com trustProxy ativo lê X-Forwarded-Proto/Host (origin pública atrás de proxy)", async () => {
    delete process.env.PUBLIC_APP_URL;
    findPageTheme.mockResolvedValue(theme({ coverUrl: null }));
    const proxied = fastify({ trustProxy: true });
    await proxied.register(shareRoutes);
    await proxied.ready();

    try {
      const response = await proxied.inject({
        method: "GET",
        url: `/s/salon/${ID}`,
        headers: {
          host: "10.0.0.7:8080",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "agendai.example.com",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(
        `og:url" content="https://agendai.example.com/s/salon/${ID}"`,
      );
      expect(response.body).toContain(
        `og:image" content="https://agendai.example.com/api/barbershops/${ID}/page-theme/og-image"`,
      );
    } finally {
      await proxied.close();
    }
  });

  it("sem trustProxy ignora X-Forwarded-* (headers forjados não mudam a origem)", async () => {
    delete process.env.PUBLIC_APP_URL;

    const response = await app.inject({
      method: "GET",
      url: `/s/salon/${ID}`,
      headers: {
        host: "10.0.0.7:8080",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`og:url" content="http://10.0.0.7:8080/s/salon/${ID}"`);
    expect(response.body).not.toContain("evil.example");
  });

  it("em produção usa PUBLIC_API_URL como base do og:image sem capa", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_API_URL", "https://api.agendai.example.com/");
    findPageTheme.mockResolvedValue(theme({ coverUrl: null }));

    const response = await app.inject({ method: "GET", url: `/s/salon/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      `og:image" content="https://api.agendai.example.com/api/barbershops/${ID}/page-theme/og-image"`,
    );
  });

  it("em produção sem PUBLIC_API_URL cai para PUBLIC_APP_URL, nunca para a requisição", async () => {
    vi.stubEnv("NODE_ENV", "production");
    findPageTheme.mockResolvedValue(theme({ coverUrl: null }));

    const response = await app.inject({
      method: "GET",
      url: `/s/salon/${ID}`,
      headers: { host: "10.0.0.7:8080" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      `og:image" content="${PUBLIC_APP_URL}/api/barbershops/${ID}/page-theme/og-image"`,
    );
    expect(response.body).not.toContain("10.0.0.7");
  });

  it("em produção sem nenhuma env omite o og:image em vez de usar a origem interna", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PUBLIC_APP_URL;
    findPageTheme.mockResolvedValue(theme({ coverUrl: null }));

    const response = await app.inject({
      method: "GET",
      url: `/s/salon/${ID}`,
      headers: { host: "10.0.0.7:8080" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('property="og:image"');
    expect(response.body).not.toContain('name="twitter:image"');
    expect(response.body).not.toContain('og:image" content="http://10.0.0.7');
    expect(response.body).toContain(`og:url" content="http://10.0.0.7:8080/s/salon/${ID}"`);
  });
});
