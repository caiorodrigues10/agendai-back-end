import { describe, expect, it } from 'vitest';
import { buildPostSvg, type PostSvgInput } from './postImageService';
import { POST_TEMPLATES, TEMPLATE_VERSION } from './postTemplates';
import { POST_CATEGORY_COLLECTIONS } from './postCategoryCollections';
import { LEGAL_POST_SAMPLES } from './legalPostSamples.fixture';
import { renderSvgToPngSync } from './postSvgRenderer';

const formats = ['square', 'portrait', 'story'] as const;
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
const textOf = (svg: string) => decode([...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(match => match[1]).join(' '));
const boxesOf = (svg: string) => [...svg.matchAll(/<g data-post-role="([^"]+)" data-x="([\d.-]+)" data-y="([\d.-]+)" data-width="([\d.-]+)" data-height="([\d.-]+)"[^>]*>(.*?)<\/g>/gs)]
  .map(match => ({ role: match[1], x: +match[2], y: +match[3], w: +match[4], h: +match[5], markup: match[6] }));

function fixture(template: typeof POST_TEMPLATES[number]): PostSvgInput {
  const legal = LEGAL_POST_SAMPLES.find(sample => sample.templateKey === template.key);
  if (legal) return { shopName: 'Bruno Azevedo', title: legal.title, ctaText: legal.ctaText, postMode: 'appointments', services: [], todaySchedule: null, templateKey: template.key, designOptions: { legalPost: legal.legalPost } };
  const collection = POST_CATEGORY_COLLECTIONS.find(item => item.category === template.businessCategory);
  const names = collection?.subjects.slice(0, 3) ?? ['Corte e barba', 'Corte na tesoura', 'Barba'];
  return {
    shopName: collection ? `${collection.label} · Exemplo` : 'Estabelecimento Exemplo',
    title: template.sampleTitle ?? (template.group === 'ofertas' ? 'Oferta de exemplo' : template.name),
    ctaText: 'Converse com a equipe', postMode: 'appointments',
    services: names.map((name, index) => ({ name, price: template.businessCategory ? 0 : 79.9 + index * 10 })),
    todaySchedule: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
    templateKey: template.key,
    primaryImageUrl: template.requiredMedia ? PHOTO : null,
    secondaryImageUrl: template.requiredMedia === 2 ? PHOTO : null,
  };
}

describe('composição medida em todo o catálogo', () => {
  it('avalia 256 modelos e os três formatos, sem incluir o motor separado de price-split', () => {
    expect(POST_TEMPLATES).toHaveLength(256);
    expect(POST_TEMPLATES.filter(template => template.businessCategory)).toHaveLength(230);
    expect(new Set(POST_TEMPLATES.map(template => template.key)).size).toBe(256);
  });

  it.each(POST_TEMPLATES.flatMap(template => formats.map(format => ({ key: template.key, template, format }))))('$key/$format preserva a mensagem e mantém caixas legíveis dentro da arte', ({ template, format }) => {
    const input = { ...fixture(template), format };
    const svg = buildPostSvg(input);
    const height = format === 'story' ? 1920 : format === 'portrait' ? 1350 : 1080;
    expect(svg).toContain('width="1080"');
    expect(svg).toContain(`height="${height}"`);
    expect(svg).toContain(`data-template-key="${template.key}"`);
    expect(textOf(svg)).toContain(input.title);
    expect(textOf(svg)).toContain(input.ctaText);
    expect(svg).not.toMatch(/>undefined<|>NaN<|="NaN(?:"|\s)/);
    if (template.businessCategory === 'advocacia') return; // Its dedicated suite checks the legal layout and identification.
    expect(svg).toContain(`data-template-version="${TEMPLATE_VERSION}"`);
    const boxes = boxesOf(svg);
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    for (const box of boxes) {
      expect(box.x, box.role).toBeGreaterThanOrEqual(64);
      expect(box.x + box.w, box.role).toBeLessThanOrEqual(1016);
      expect(box.y, box.role).toBeGreaterThanOrEqual(format === 'story' ? 178 : 52);
      expect(box.y + box.h, box.role).toBeLessThanOrEqual(height - (format === 'story' ? 206 : 52));
      const sizes = [...box.markup.matchAll(/font-size="([\d.]+)"/g)].map(match => +match[1]);
      const minimum = box.role === 'platform' ? 24 : box.role === 'headline' ? 54 : box.role === 'cta' || box.role === 'brand' ? 40 : 36;
      expect(Math.min(...sizes), box.role).toBeGreaterThanOrEqual(minimum);
      for (const other of boxes) {
        if (box === other) continue;
        const overlap = box.x < other.x + other.w - .1 && box.x + box.w > other.x + .1 && box.y < other.y + other.h - .1 && box.y + box.h > other.y + .1;
        expect(overlap, `${box.role} × ${other.role}`).toBe(false);
      }
    }
    const headline = boxes.find(box => box.role === 'headline')!;
    expect(textOf(headline.markup)).toBe(input.title);
    expect(headline.markup).not.toContain('...');
    const mode = svg.match(/data-post-composition="([^"]+)"/)![1];
    if (mode === 'menu') for (const service of input.services) expect(textOf(svg)).toContain(service.name);
    // A name already contained in the headline is shown once, preserving the headline's casing.
    if (mode === 'service' && input.services.length) expect(textOf(svg).toLocaleLowerCase('pt-BR')).toContain(input.services[0].name.toLocaleLowerCase('pt-BR'));
    if (template.businessCategory) expect(textOf(svg)).not.toContain('R$');
  });

  it.each(['square', 'portrait', 'story'] as const)('rejeita excesso de conteúdo em %s com erro acionável, sem cortar palavras', format => {
    for (const key of ['outros-colecao-1', 'outros-colecao-7', 'tipografico']) {
      const template = POST_TEMPLATES.find(item => item.key === key)!;
      expect(() => buildPostSvg({ ...fixture(template), format, title: 'W'.repeat(200) })).toThrow('conteúdo não cabe');
    }
  });

  it('não inventa estrelas, autoria, recompensa ou quantidade de vagas nos modelos legados', () => {
    for (const key of ['depoimento', 'avaliacao-clientes', 'fidelidade', 'ultimas-vagas']) {
      const template = POST_TEMPLATES.find(item => item.key === key)!;
      const svg = buildPostSvg({ ...fixture(template), title: 'Informação fornecida pela equipe' });
      expect(textOf(svg)).toContain('Informação fornecida pela equipe');
      expect(textOf(svg)).not.toMatch(/cinco estrelas|5 estrelas|5[,.]0|cliente satisfeit|ganhe|grátis|últimas \d|apenas \d/i);
      expect(svg).not.toContain('data-post-illustration="star"');
    }
  });

  it('escapa XML na mensagem, CTA e nome dos serviços sem perder caracteres', () => {
    const template = POST_TEMPLATES.find(item => item.key === 'outros-colecao-7')!;
    const input = { ...fixture(template), title: 'Conteúdo <seguro> & claro', ctaText: 'Fale com "a equipe"', shopName: 'Espaço <A> & B', services: [{ name: 'Serviço <A> & B', price: 0 }] };
    const svg = buildPostSvg(input);
    expect(svg).not.toContain('<seguro>');
    expect(svg).not.toContain('<A>');
    expect(textOf(svg)).toContain(input.title);
    expect(textOf(svg)).toContain(input.ctaText);
    expect(textOf(svg)).toContain(input.services[0].name);
  });

  it.each(['outros-colecao-1', 'outros-colecao-3', 'outros-colecao-7', 'antes-depois', 'oferta-clean'])('%s produz PNG real sem depender de rede ou banco', key => {
    const template = POST_TEMPLATES.find(item => item.key === key)!;
    const png = renderSvgToPngSync(buildPostSvg({ ...fixture(template), format: 'portrait' }));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1350);
  });
});
