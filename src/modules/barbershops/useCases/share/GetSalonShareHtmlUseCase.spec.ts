/// <reference types="vitest/globals" />
import type { IBarbershopRepository, IPageThemeDTO } from "../../repositories/IBarbershopRepository";
import type { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { GetSalonShareHtmlUseCase } from "./GetSalonShareHtmlUseCase";

const ID = "1f9c0a4e-3f3a-4c9b-9f3d-0f2b1a6d7e88";
const COVER = "https://res.cloudinary.com/demo/image/upload/v1700000000/salao/capa.jpg";

function makeShop(overrides: Partial<IBarbershopResponseDTO> = {}): IBarbershopResponseDTO {
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

function makeTheme(overrides: Partial<IPageThemeDTO> = {}): IPageThemeDTO {
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

function makeUseCase(shop: IBarbershopResponseDTO | null, theme: IPageThemeDTO | null = null) {
  const repository = {
    findByIdPublic: vi.fn().mockResolvedValue(shop),
    findPageTheme: vi.fn().mockResolvedValue(theme),
  } as unknown as IBarbershopRepository;
  return { useCase: new GetSalonShareHtmlUseCase(repository), repository };
}

const input = {
  id: ID,
  publicAppUrl: "https://agendai.example.com",
  apiOrigin: "https://api.agendai.example.com",
};

describe("GetSalonShareHtmlUseCase", () => {
  it("gera canonical/og:url e redirect a partir do PUBLIC_APP_URL", async () => {
    const { useCase } = makeUseCase(makeShop());

    const result = await useCase.execute(input);

    expect(result).not.toBeNull();
    const html = result!.html;
    expect(html).toContain('<link rel="canonical" href="https://agendai.example.com/s/salon/' + ID + '">');
    expect(html).toContain(`<meta property="og:url" content="https://agendai.example.com/s/salon/${ID}">`);
    expect(html).toContain(`content="0;url=https://agendai.example.com/queue/${ID}?tab=profile"`);
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("sem capa aponta o og:image para a rota og-image da API", async () => {
    const { useCase } = makeUseCase(makeShop(), makeTheme({ coverUrl: null }));

    const { html } = (await useCase.execute(input))!;

    expect(html).toContain(
      `<meta property="og:image" content="https://api.agendai.example.com/api/barbershops/${ID}/page-theme/og-image">`,
    );
  });

  it("com capa usa o recorte 1200×630 JPEG sem ampliar", async () => {
    const { useCase } = makeUseCase(
      makeShop(),
      makeTheme({ coverUrl: COVER, coverWidth: 1600, coverHeight: 900 }),
    );

    const { html } = (await useCase.execute(input))!;

    expect(html).toContain(
      "image/upload/w_1200,h_630,c_fill,g_auto,f_jpg,q_auto/",
    );
  });

  it("capa menor que 1200px sai na proporção do original (nunca amplia)", async () => {
    const { useCase } = makeUseCase(
      makeShop(),
      makeTheme({ coverUrl: COVER, coverWidth: 800, coverHeight: 600 }),
    );

    const { html } = (await useCase.execute(input))!;

    expect(html).toContain("w_800,h_420,c_fill,g_auto,f_jpg,q_auto");
    expect(html).not.toContain("w_1200");
  });

  it("aplica o ponto focal salvo no tema", async () => {
    const { useCase } = makeUseCase(
      makeShop(),
      makeTheme({
        coverUrl: COVER,
        coverWidth: 1600,
        coverHeight: 900,
        coverFocalX: 80,
        coverFocalY: 20,
      }),
    );

    const { html } = (await useCase.execute(input))!;

    expect(html).toContain("g_xy_center,x_1280,y_180");
    expect(html).not.toContain("g_auto");
  });

  it("escapa o nome do salão e não emite <script> nenhum", async () => {
    const { useCase } = makeUseCase(
      makeShop({ name: `Casa do <script>alert("x")</script> & Cia` }),
    );

    const { html } = (await useCase.execute(input))!;

    expect(html).not.toContain("<script");
    expect(html).not.toContain("</script");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&amp; Cia");
    expect(html).not.toContain('alert("x")');
  });

  it("escapa aspas também nos atributos (description/alt)", async () => {
    const { useCase } = makeUseCase(makeShop({ name: 'Salão "Top" & <b>Melhor</b>' }));

    const { html } = (await useCase.execute(input))!;

    expect(html).not.toContain('name="Top"');
    expect(html).toContain('content="Salão &quot;Top&quot; &amp; &lt;b&gt;Melhor&lt;/b&gt; em São Paulo');
  });

  it("corpo é acessível (main, título, link visível, fundo escuro) e sem script", async () => {
    const { useCase } = makeUseCase(makeShop());

    const { html } = (await useCase.execute(input))!;

    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain("<main");
    expect(html).toContain(">Abrindo o perfil...</h1>");
    expect(html).toContain("background:#0b1220");
    expect(html).toContain(
      `<a href="https://agendai.example.com/queue/${ID}?tab=profile" style="color:#7dd3fc`,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("sem base de API (produção sem env) omite og:image em vez de gerar URL relativa", async () => {
    const { useCase } = makeUseCase(makeShop(), makeTheme({ coverUrl: null }));

    const { html } = (await useCase.execute({ ...input, apiOrigin: "" }))!;

    expect(html).not.toContain('property="og:image"');
    expect(html).not.toContain('name="twitter:image"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('property="og:url"');
  });

  it("retorna null para salão inexistente", async () => {
    const { useCase, repository } = makeUseCase(null);

    expect(await useCase.execute(input)).toBeNull();
    expect(repository.findPageTheme).not.toHaveBeenCalled();
  });

  it("retorna null para salão inativo", async () => {
    const { useCase } = makeUseCase(makeShop({ active: false }));

    expect(await useCase.execute(input)).toBeNull();
  });
});
