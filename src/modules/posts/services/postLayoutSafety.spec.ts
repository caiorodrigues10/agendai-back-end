import { buildPostSvg, postLayoutMetrics, type PostSvgInput } from './postImageService';
import { listPostTemplates } from './postTemplates';

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const formats = ['square', 'portrait', 'story'] as const;
const catalog = listPostTemplates().filter(template => template.businessCategory !== 'advocacia' && template.key !== 'price-split');
const boxes = (svg: string) => [...svg.matchAll(/<g data-post-role="([^"]+)" data-x="([\d.-]+)" data-y="([\d.-]+)" data-width="([\d.-]+)" data-height="([\d.-]+)"[^>]*>(.*?)<\/g>/gs)]
  .map(match => ({ role: match[1], x: +match[2], y: +match[3], w: +match[4], h: +match[5], markup: match[6] }));
const inputFor = (key: string): PostSvgInput => ({
  shopName: 'Studio Aurora', logoUrl: PHOTO, templateKey: key,
  services: [{ name: 'Coloração Premium Completa', price: 189.9 }, { name: 'Corte Editorial Masculino', price: 95 }, { name: 'Barba e acabamento', price: 65 }],
  todaySchedule: { isOpen: false, openTime: '', closeTime: '' }, postMode: 'appointments',
  ctaText: 'Agende seu horário com a equipe', title: 'Cuidado em cada etapa do atendimento',
  primaryImageUrl: PHOTO, secondaryImageUrl: PHOTO, designOptions: { focalX: 0, focalY: 100 },
});

describe('segurança geométrica de layouts com logo e foto', () => {
  it.each(catalog.map(template => ({ key: template.key })))('$key separa conteúdo, CTA e rodapé nos três formatos', ({ key }) => {
    for (const format of formats) {
      const input = { ...inputFor(key), format };
      const svg = buildPostSvg(input);
      const metrics = postLayoutMetrics(input);
      const groups = boxes(svg);
      expect(groups.length).toBeGreaterThanOrEqual(4);
      const cta = groups.find(group => group.role === 'cta')!;
      const platform = groups.find(group => group.role === 'platform')!;
      for (const group of groups) {
        expect(group.x, group.role).toBeGreaterThanOrEqual(64);
        expect(group.x + group.w, group.role).toBeLessThanOrEqual(1016);
        expect(group.y, group.role).toBeGreaterThanOrEqual(format === 'story' ? 178 : 52);
        expect(group.y + group.h, group.role).toBeLessThanOrEqual(metrics.height - (format === 'story' ? 206 : 52));
        if (!['cta', 'platform'].includes(group.role)) expect(group.y + group.h, group.role).toBeLessThan(metrics.ctaY);
        for (const other of groups) {
          if (group === other) continue;
          expect(group.x < other.x + other.w - .1 && group.x + group.w > other.x + .1 && group.y < other.y + other.h - .1 && group.y + group.h > other.y + .1, `${key}/${format}: ${group.role} × ${other.role}`).toBe(false);
        }
      }
      expect(cta.y + cta.h).toBeLessThan(platform.y);
    }
  });

  it.each(['brand', 'rose', 'clara'])('ofertas mantêm nome, preço e CTA completos na paleta %s', paletteKey => {
    for (const template of catalog.filter(template => template.priceMode === 'single')) for (const format of formats) {
      const input = { ...inputFor(template.key), paletteKey, format, illustrativeBackground: true };
      const svg = buildPostSvg(input);
      const groups = boxes(svg);
      const text = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(match => match[1]).join(' ').replace(/\s+/g, ' ');
      expect(text, template.key).toContain(input.title);
      expect(text, template.key).toContain(input.services[0].name);
      expect(text, template.key).toContain('189,90');
      expect(text, template.key).toContain(input.ctaText);
      const price = groups.find(group => group.role === 'price')!;
      const cta = groups.find(group => group.role === 'cta')!;
      expect(price, template.key).toBeDefined();
      expect(price.y + price.h).toBeLessThan(cta.y);
    }
  });

  it('reserva o topo e a base de Stories para a interface do aplicativo', () => {
    const input = { ...inputFor('agenda-aberta'), format: 'story' as const };
    const metrics = postLayoutMetrics(input);
    const groups = boxes(buildPostSvg(input));
    expect(metrics.shopY).toBeGreaterThan(178);
    expect(Math.min(...groups.map(group => group.y))).toBeGreaterThanOrEqual(178);
    expect(Math.max(...groups.map(group => group.y + group.h))).toBeLessThanOrEqual(1920 - 206);
  });

  it('aplica os controles de foco e intensidade sem descartar a foto própria', () => {
    const input = inputFor('editorial-foto');
    const topLeft = buildPostSvg({ ...input, designOptions: { focalX: 0, focalY: 0, overlay: 0 } });
    const bottomRight = buildPostSvg({ ...input, designOptions: { focalX: 100, focalY: 100, overlay: 0 } });
    const stronger = buildPostSvg({ ...input, designOptions: { focalX: 0, focalY: 0, overlay: 100 } });
    for (const svg of [topLeft, bottomRight, stronger]) {
      expect(svg).toContain(PHOTO);
      expect(svg).toContain('clip-path="url(');
    }
    expect(topLeft).not.toBe(bottomRight);
    expect(topLeft).not.toBe(stronger);
  });
});
