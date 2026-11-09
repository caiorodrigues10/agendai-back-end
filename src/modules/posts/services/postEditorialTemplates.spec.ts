/// <reference types="vitest/globals" />
import { closePostRenderPool } from '@/shared/infra/worker/postRenderPool';
import { buildPostSvg, renderPostSvgToPng, type PostSvgInput } from './postImageService';
import { listPostTemplates, TEMPLATE_VERSION } from './postTemplates';
import { loadPostStockImage } from './postStockImages';

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const formats = ['square', 'portrait', 'story'] as const;
const baseInput: PostSvgInput = {
  shopName: 'Studio Aurora', logoUrl: null,
  services: [{ name: 'Corte Editorial', price: 90 }, { name: 'Coloração Premium', price: 180 }],
  todaySchedule: { isOpen: true, openTime: '09:00', closeTime: '19:00' }, postMode: 'both',
  ctaText: 'Agende agora', title: 'O novo clássico do fim de semana',
};
const textOf = (svg: string) => [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(match => match[1]).join(' ').replace(/\s+/g, ' ');
const legacyKeys = [
  'agenda-aberta', 'ultimas-vagas', 'promocao-relampago', 'servico-destaque',
  'antes-depois', 'transformacao', 'profissional-destaque', 'depoimento',
  'menu-servicos', 'horario-especial', 'novidade', 'editorial-minimalista',
  'editorial-foto', 'capa-impacto', 'revista-beleza', 'tipografico', 'oferta-clean',
  'recado-studio', 'promocao-cobre', 'combo-premium', 'agenda-premium', 'beleza-luxo',
  'gift-card', 'fidelidade', 'avaliacao-clientes', 'lancamento-premium',
];

describe('catálogo de templates v12', () => {
  it('expõe templateVersion 11 e preserva as 26 chaves legadas', () => {
    expect(TEMPLATE_VERSION).toBe(12);
    const catalog = listPostTemplates().filter(template => template.key !== 'price-split');
    expect(catalog).toHaveLength(256);
    expect(catalog.filter(template => !template.businessCategory).map(template => template.key)).toEqual(legacyKeys);
    expect(catalog.every(template => template.templateVersion === TEMPLATE_VERSION)).toBe(true);
    expect(catalog.every(template => template.previewUrl === `/api/posts/templates/${template.key}/preview`)).toBe(true);
  });
  it('mantém a exigência das fotos próprias nos quatro modelos definidos', () => {
    const required = listPostTemplates().filter(template => template.requiredMedia > 0);
    expect(required.map(template => template.key).sort()).toEqual(['antes-depois', 'editorial-minimalista', 'profissional-destaque', 'transformacao']);
    expect(required.every(template => template.photoMode === 'required')).toBe(true);
    expect(required.find(template => template.key === 'antes-depois')!.requiredMedia).toBe(2);
  });
  it('só oferece foto onde o layout realmente a utiliza', () => {
    for (const template of listPostTemplates().filter(item => item.businessCategory !== 'advocacia' && item.key !== 'price-split')) {
      const svg = buildPostSvg({ ...baseInput, templateKey: template.key, title: template.sampleTitle || baseInput.title, primaryImageUrl: PHOTO, secondaryImageUrl: PHOTO });
      if (template.photoMode === 'none') expect(svg, template.key).not.toContain('<image');
      else expect(svg, template.key).toContain(PHOTO);
    }
  });
  it('expõe preço apenas nos modelos comerciais correspondentes', () => {
    const priced = listPostTemplates().filter(template => template.priceMode === 'single').map(template => template.key).sort();
    expect(priced).toEqual(['beleza-luxo', 'combo-premium', 'gift-card', 'oferta-clean', 'promocao-cobre', 'promocao-relampago', 'servico-destaque']);
    expect(listPostTemplates().filter(template => template.businessCategory).every(template => !template.priceMode)).toBe(true);
  });
});

describe('legados no motor de composição medido', () => {
  it.each(legacyKeys)('%s preserva identidade, mensagem e CTA em todos os formatos', key => {
    for (const format of formats) {
      const svg = buildPostSvg({ ...baseInput, templateKey: key, format });
      expect(svg).toContain(`data-template-key="${key}"`);
      expect(svg).toContain(`data-template-version="${TEMPLATE_VERSION}"`);
      expect(textOf(svg)).toContain('STUDIO AURORA');
      expect(textOf(svg)).toContain(baseInput.title);
      expect(textOf(svg)).toContain(baseInput.ctaText);
      expect(svg).not.toContain('<image');
    }
  });
  it.each(legacyKeys)('%s escapa conteúdo livre em XML', key => {
    const svg = buildPostSvg({ ...baseInput, templateKey: key, shopName: 'Luz & Sombra <Studio>', title: 'Corte "perfeito" & barba' });
    expect(svg).not.toContain('<Studio>');
    expect(svg).not.toContain('"perfeito"');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;STUDIO&gt;');
    expect(svg).not.toContain('<script');
  });
  it('identifica o estabelecimento como marca principal e a plataforma no rodapé', () => {
    const svg = buildPostSvg({ ...baseInput, templateKey: 'editorial-foto' });
    expect(svg).toContain('data-post-role="brand"');
    expect(svg).toContain('STUDIO AURORA');
    expect(svg).toContain('data-post-role="platform"');
    expect(textOf(svg)).toContain('Feito com Agenda Já · agendai.app');
  });
  it('mantém nomes e preços completos na lista comercial', () => {
    const services = [{ name: 'Coloração Premium Completa', price: 189.9 }, { name: 'Corte Editorial Masculino', price: 95 }, { name: 'Hidratação Capilar', price: 79.5 }];
    for (const format of formats) {
      const text = textOf(buildPostSvg({ ...baseInput, templateKey: 'menu-servicos', services, title: 'Serviços e valores', format }));
      for (const service of services) expect(text).toContain(service.name);
      for (const value of ['189,90', '95,00', '79,50']) expect(text).toContain(value);
    }
  });
  it('não adiciona estrelas nem atribui um depoimento a um cliente inventado', () => {
    for (const key of ['depoimento', 'avaliacao-clientes']) for (const format of formats) {
      const svg = buildPostSvg({ ...baseInput, templateKey: key, format });
      expect(svg).not.toContain('l 5.6 11.4');
      expect(textOf(svg)).not.toMatch(/cliente satisfeit|5 estrelas|5[,.]0/i);
      expect(textOf(svg)).toContain(baseInput.title);
    }
  });
  it('mantém os seis assets promocionais disponíveis e distintos', () => {
    const keys = ['promo-photo-barber-tools', 'promo-photo-barber-copper', 'promo-photo-salon-lobby', 'promo-photo-salon-calendar', 'promo-photo-beauty-products', 'promo-photo-beauty-gift'];
    const photos = keys.map(key => loadPostStockImage(key));
    expect(photos.every(photo => photo?.startsWith('data:image/png;base64,'))).toBe(true);
    expect(new Set(photos).size).toBe(keys.length);
  });
});

describe('amostras PNG pelo worker', () => {
  afterAll(() => closePostRenderPool());
  it.each([
    { key: 'editorial-foto', format: 'portrait' as const },
    { key: 'oferta-clean', format: 'square' as const },
    { key: 'recado-studio', format: 'story' as const },
  ])('$key/$format rasteriza a arte com as fontes locais', async ({ key, format }) => {
    const png = await renderPostSvgToPng(buildPostSvg({ ...baseInput, templateKey: key, primaryImageUrl: PHOTO, format }));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(format === 'story' ? 1920 : format === 'portrait' ? 1350 : 1080);
  });
});
