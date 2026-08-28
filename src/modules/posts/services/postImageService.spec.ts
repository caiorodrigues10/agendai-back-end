import { describe, expect, it } from "vitest";
import {
  buildPostSvg,
  pngToDataUrl,
  renderPostSvgToPng,
} from "./postImageService";

const minimalInput = {
  shopName: "Barbearia Teste",
  logoUrl: null,
  services: [{ name: "Corte Degradê", price: 45 }],
  todaySchedule: { isOpen: true, openTime: "09:00", closeTime: "19:00" },
  postMode: "both" as const,
  ctaText: "Fila ou agenda",
  title: "Vem pra cá hoje!",
};

describe("buildPostSvg", () => {
  it("gera SVG 1080x1080 com o nome do salão", () => {
    const svg = buildPostSvg(minimalInput);
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="1080"');
    expect(svg).toContain("BARBEARIA TESTE");
    expect(svg).toContain("Vem pra cá hoje!");
  });

  it("usa a paleta preta + esmeralda do site, sem ouro", () => {
    const svg = buildPostSvg(minimalInput);
    expect(svg).toContain("#10B981");
    expect(svg).toContain("#0F0F0F");
    expect(svg).not.toContain("#F59E0B");
    expect(svg).toContain("AGEND");
    expect(svg).toContain("#00C2B3");
  });

  it("quebra título longo em duas linhas", () => {
    const svg = buildPostSvg({
      ...minimalInput,
      title: "Corte e barba com desconto especial hoje",
    });
    expect(svg).toContain("Corte e barba com");
    expect(svg).toContain("desconto especial hoje");
  });

  it("escapa & do nome do salão para XML", () => {
    const svg = buildPostSvg({ ...minimalInput, shopName: "Barba & Cia" });
    expect(svg).toContain("BARBA &amp; CIA");
    expect(svg).not.toContain("BARBA & CIA");
  });

  it("não vaza tags de script no SVG", () => {
    const svg = buildPostSvg({
      ...minimalInput,
      shopName: "<script>alert(1)</script>",
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("</script>");
  });
});

describe("renderPostSvgToPng", () => {
  it("renderiza o post completo em PNG com tamanho de arte (fonte empacotada)", () => {
    const png = renderPostSvgToPng(buildPostSvg(minimalInput));
    expect(png.length).toBeGreaterThan(20_000);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("renderiza SVG pequeno em PNG com magic bytes válidos", () => {
    const png = renderPostSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#0B0F19"/></svg>'
    );
    expect(png.length).toBeGreaterThan(0);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});

describe("pngToDataUrl", () => {
  it("gera data URL base64 decodificável", () => {
    const png = renderPostSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#0B0F19"/></svg>'
    );
    const dataUrl = pngToDataUrl(png);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const base64 = dataUrl.split(",")[1];
    const decoded = Buffer.from(base64, "base64");
    expect(decoded.length).toBe(png.length);
    expect(decoded.equals(png)).toBe(true);
  });
});