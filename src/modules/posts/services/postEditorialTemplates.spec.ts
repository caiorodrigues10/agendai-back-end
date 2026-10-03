/// <reference types="vitest/globals" />
import { closePostRenderPool } from "@/shared/infra/worker/postRenderPool";
import {
  buildPostSvg,
  postLayoutMetrics,
  renderPostSvgToPng,
  type PostSvgInput,
} from "./postImageService";
import { listPostTemplates, TEMPLATE_VERSION } from "./postTemplates";

const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const baseInput: PostSvgInput = {
  shopName: "Studio Aurora",
  logoUrl: null,
  services: [
    { name: "Corte Editorial", price: 90 },
    { name: "Coloração Premium", price: 180 },
  ],
  todaySchedule: { isOpen: true, openTime: "09:00", closeTime: "19:00" },
  postMode: "both",
  ctaText: "Agende agora",
  title: "O novo clássico do seu fim de semana",
};

const formats = ["square", "portrait", "story"] as const;
const newTemplates = [
  { key: "editorial-foto", stockImageKey: "salon" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "capa-impacto", stockImageKey: "barber" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "revista-beleza", stockImageKey: "beauty" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "tipografico", stockImageKey: "promo-editorial" as const, photoMode: "optional" as const, acceptsUploadedPhoto: false },
  { key: "oferta-clean", stockImageKey: "promo-offer" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "recado-studio", stockImageKey: "promo-notice" as const, photoMode: "optional" as const, acceptsUploadedPhoto: false },
  { key: "promocao-cobre", stockImageKey: "promo-flash" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "combo-premium", stockImageKey: "promo-combo" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "agenda-premium", stockImageKey: "promo-slots" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "beleza-luxo", stockImageKey: "promo-beauty-luxe" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "gift-card", stockImageKey: "promo-gift" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "fidelidade", stockImageKey: "promo-loyalty" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "avaliacao-clientes", stockImageKey: "promo-review" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
  { key: "lancamento-premium", stockImageKey: "promo-launch" as const, photoMode: "optional" as const, acceptsUploadedPhoto: true },
];

const promoStockTemplates = [
  { key: "agenda-aberta", stockImageKey: "promo-agenda" },
  { key: "ultimas-vagas", stockImageKey: "promo-offer" },
  { key: "promocao-relampago", stockImageKey: "promo-offer" },
  { key: "servico-destaque", stockImageKey: "promo-service" },
  { key: "menu-servicos", stockImageKey: "promo-menu" },
  { key: "horario-especial", stockImageKey: "promo-notice" },
  { key: "novidade", stockImageKey: "promo-beauty" },
  { key: "promocao-cobre", stockImageKey: "promo-flash" },
  { key: "combo-premium", stockImageKey: "promo-combo" },
  { key: "agenda-premium", stockImageKey: "promo-slots" },
  { key: "beleza-luxo", stockImageKey: "promo-beauty-luxe" },
  { key: "gift-card", stockImageKey: "promo-gift" },
  { key: "fidelidade", stockImageKey: "promo-loyalty" },
  { key: "avaliacao-clientes", stockImageKey: "promo-review" },
  { key: "lancamento-premium", stockImageKey: "promo-launch" },
];

describe("catálogo de templates v2", () => {
  it("expõe templateVersion 2 e mantém chaves legadas", () => {
    expect(TEMPLATE_VERSION).toBe(2);
    const keys = listPostTemplates().map((t) => t.key);
    for (const legacy of [
      "agenda-aberta", "ultimas-vagas", "promocao-relampago", "servico-destaque",
      "antes-depois", "transformacao", "profissional-destaque", "depoimento",
      "menu-servicos", "horario-especial", "novidade", "editorial-minimalista",
    ]) {
      expect(keys).toContain(legacy);
    }
    expect(listPostTemplates().every((t) => t.templateVersion === 2)).toBe(true);
  });

  it("foto obrigatória somente nos 4 modelos definidos", () => {
    const required = listPostTemplates().filter((t) => t.requiredMedia > 0);
    expect(required.map((t) => t.key).sort()).toEqual([
      "antes-depois", "editorial-minimalista", "profissional-destaque", "transformacao",
    ]);
    expect(required.every((t) => t.photoMode === "required")).toBe(true);
    expect(listPostTemplates().find((t) => t.key === "antes-depois")!.requiredMedia).toBe(2);
  });

  it("novos modelos expõem group/photoMode/stockImageKey coerentes", () => {
    const catalog = listPostTemplates();
    for (const item of newTemplates) {
      const entry = catalog.find((t) => t.key === item.key);
      expect(entry, item.key).toBeDefined();
      expect(entry!.photoMode).toBe(item.photoMode);
      expect(entry!.requiredMedia).toBe(0);
      if ("stockImageKey" in item) {
        expect((entry as { stockImageKey?: string }).stockImageKey).toBe(item.stockImageKey);
      }
      expect(entry!.previewUrl).toBe(`/api/posts/templates/${item.key}/preview`);
    }
  });

  it("modelos comerciais usam artes promocionais editáveis como fallback", () => {
    const catalog = listPostTemplates();
    for (const item of promoStockTemplates) {
      const entry = catalog.find((t) => t.key === item.key);
      expect(entry, item.key).toBeDefined();
      expect(entry!.photoMode).toBe("optional");
      expect((entry as { stockImageKey?: string }).stockImageKey).toBe(item.stockImageKey);
    }
  });
});

describe("novos modelos editoriais — SVG nos 3 formatos", () => {
  it.each(newTemplates.map((t) => [t.key]))("%s renderiza em square/portrait/story", (key) => {
    for (const format of formats) {
      const svg = buildPostSvg({ ...baseInput, templateKey: key as string, format });
      expect(svg).toContain("<svg");
      expect(svg).toContain('data-template-version="2"');
      expect(svg).toContain(`data-template-key="${key}"`);
      expect(svg).toContain('width="1080"');
      const expectedHeight = format === "portrait" ? 1350 : format === "story" ? 1920 : 1080;
      expect(svg).toContain(`height="${expectedHeight}"`);
      expect(svg).toContain("STUDIO AURORA");
      expect(svg).toContain("Agende agora");
      // sem foto: nenhum placeholder de imagem na exportação
      expect(svg).not.toContain("<image");
    }
  });

  it.each(newTemplates.map((t) => [t.key]))("%s escapa XML no nome do salão e título", (key) => {
    const svg = buildPostSvg({
      ...baseInput,
      templateKey: key as string,
      shopName: "Luz & Sombra <Studio>",
      title: 'Corte "perfeito" & barba',
    });
    expect(svg).not.toContain("<Studio>");
    expect(svg).not.toContain('"perfeito"');
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<script");
  });

  it.each(newTemplates.map((t) => [t.key]))("%s desenha a foto real quando recebe dataURL", (key) => {
    const template = newTemplates.find((t) => t.key === key)!;
    const svg = buildPostSvg({ ...baseInput, templateKey: key as string, primaryImageUrl: PHOTO });
    if (!template.acceptsUploadedPhoto) {
      expect(svg).not.toContain(PHOTO);
    } else {
      expect(svg).toContain("<image");
      expect(svg).toContain(PHOTO);
      expect(svg).not.toContain("Adicione a foto");
    }
  });

  it("identidade principal é do salão; plataforma aparece discreta no rodapé", () => {
    const svg = buildPostSvg({ ...baseInput, templateKey: "editorial-foto" });
    expect(svg).toContain("STUDIO AURORA");
    expect(svg).toContain("Feito com Agende Já · agendai.app");
  });
});

const legacyPhotoTemplates = [
  "ultimas-vagas", "promocao-relampago", "servico-destaque", "novidade",
  "antes-depois", "transformacao", "profissional-destaque", "editorial-minimalista",
];

function parseGeometry(svg: string) {
  const texts = [...svg.matchAll(/<text[^>]*\sy="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({
    y: Number(m[1]),
    content: m[2],
  }));
  const elements = [...svg.matchAll(/<(image|rect|circle)[^>]*?>/g)].map((tag) => {
    const attr = (name: string) => {
      const m = tag[0].match(new RegExp(`${name}="([-\\d.]+)"`));
      return m ? Number(m[1]) : 0;
    };
    if (tag[1] === "circle") {
      return { kind: "circle" as const, top: attr("cy") - attr("r"), bottom: attr("cy") + attr("r"), right: attr("cx") + attr("r") };
    }
    return {
      kind: tag[1] as "image" | "rect",
      top: attr("y"),
      bottom: attr("y") + attr("height"),
      right: (tag[0].match(/x="([-\d.]+)"/) ? Number(tag[0].match(/x="([-\d.]+)"/)![1]) : 0) + attr("width"),
    };
  });
  return { texts, elements };
}

describe("bounds de layout — nada passa de ctaY e nenhum texto sobrepõe foto", () => {
  const worstInput: PostSvgInput = {
    ...baseInput,
    title: "Corte e barba com desconto especial hoje", // 2 linhas
    todaySchedule: { isOpen: false, openTime: "", closeTime: "" },
    services: [
      { name: "Coloração Premium Completa", price: 189.9 },
      { name: "Corte Editorial Masculino", price: 95 },
    ],
  };

  const cases: { key: string; photo: boolean }[] = [
    ...newTemplates.map((t) => ({ key: t.key, photo: true })),
    ...newTemplates.map((t) => ({ key: t.key, photo: false })),
    ...legacyPhotoTemplates.map((key) => ({ key, photo: true })),
  ];

  it.each(cases.map((c) => [`${c.key}${c.photo ? " (foto)" : ""}`, c.key, c.photo] as const))(
    "%s respeita limites verticais nos 3 formatos",
    (_label, key, photo) => {
      const input: PostSvgInput = { ...worstInput, templateKey: key };
      if (photo) {
        input.primaryImageUrl = PHOTO;
        input.secondaryImageUrl = PHOTO;
      }
      for (const format of formats) {
        const current: PostSvgInput = { ...input, format };
        const svg = buildPostSvg(current);
        const m = postLayoutMetrics(current);
        const { texts, elements } = parseGeometry(svg);
        const ctaTextY = m.ctaY + 56;
        // Conteúdo nunca desce além do texto do CTA (exceção: rodapé da plataforma).
        for (const t of texts) {
          if (t.content.includes("agendai.app")) {
            expect(t.y).toBeLessThanOrEqual(m.footerY + 1);
          } else {
            expect(t.y, `${key}/${format}/text "${t.content.slice(0, 24)}" y=${t.y}`).toBeLessThanOrEqual(ctaTextY);
          }
        }
        // Fundos/painéis (rect/circle) dentro da arte; imagens têm zoom focal
        // intencional (> painel) e só precisam cobrir/interseccionar o canvas.
        for (const el of elements) {
          if (el.kind === "image") {
            expect(el.bottom, `${key}/${format}/image cobre canvas`).toBeGreaterThan(0);
            expect(el.top).toBeLessThan(m.height);
            expect(el.right).toBeGreaterThan(0);
          } else {
            expect(el.bottom, `${key}/${format}/${el.kind} bottom=${el.bottom}`).toBeLessThanOrEqual(m.height);
            expect(el.top).toBeGreaterThanOrEqual(-1);
            expect(el.right).toBeLessThanOrEqual(1081);
          }
        }
      }
    }
  );

  it("cabeçalho de story respeita safe top de 120px", () => {
    const mStory = postLayoutMetrics({ ...baseInput, format: "story" });
    expect(mStory.shopY).toBeGreaterThanOrEqual(150);
    expect(mStory.top).toBeGreaterThanOrEqual(190);
    // sem logo, baseline do nome do salão também fica dentro do safe top
    expect(mStory.shopY - 40).toBeGreaterThanOrEqual(120);
  });
});

describe("depoimento sem conteúdo fictício", () => {
  it("não desenha estrelas fixas nem autoria inventada", () => {
    for (const format of formats) {
      const svg = buildPostSvg({ ...baseInput, templateKey: "depoimento", format });
      expect(svg).not.toContain("l 5.6 11.4"); // path de estrela
      expect(svg).not.toContain("CLIENTE");
      expect(svg).toContain("&#8220;");
      expect(svg).toContain("clássico");
    }
  });
});

describe("render PNG dos novos modelos", () => {
  afterAll(async () => {
    await closePostRenderPool();
  });

  it("6 modelos x 3 formatos renderizam PNG válidos", async () => {
    for (const { key } of newTemplates) {
      for (const format of formats) {
        const png = await renderPostSvgToPng(buildPostSvg({ ...baseInput, templateKey: key, format }));
        expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect(png.length).toBeGreaterThan(5_000);
      }
    }
  }, 120_000);

  it("modelos com foto renderizam dataURL embutido", async () => {
    const png = await renderPostSvgToPng(
      buildPostSvg({ ...baseInput, templateKey: "capa-impacto", primaryImageUrl: PHOTO, format: "story" })
    );
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 60_000);
});
