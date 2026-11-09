import { describe, it, expect } from 'vitest';
import { postAudience } from './postAudience';
import { availablePostTemplates, listPostTemplates } from './postTemplates';
import { POST_CATEGORY_COLLECTIONS } from './postCategoryCollections';
import { POST_PALETTES } from './postPalettes';

describe('coleções por segmento', () => {
  it.each(POST_CATEGORY_COLLECTIONS)('resolve $segment na categoria $category sem deduzir gênero', collection => {
    expect(postAudience({ businessSegment: collection.segment, targetAudience: 'UNISSEX' })).toMatchObject({ category: collection.category, stock: collection.stock, audience: 'UNISSEX' });
  });
  it('cobre os 23 segmentos com dez modelos próprios por categoria', () => {
    const catalog = listPostTemplates().filter(template => template.businessCategory);
    expect(POST_CATEGORY_COLLECTIONS).toHaveLength(23);
    expect(new Set(POST_CATEGORY_COLLECTIONS.map(collection => collection.category)).size).toBe(23);
    expect(catalog).toHaveLength(230);
    for (const collection of POST_CATEGORY_COLLECTIONS) {
      const templates = catalog.filter(template => template.businessCategory === collection.category);
      expect(templates, collection.segment).toHaveLength(10);
      expect(new Set(templates.map(template => template.key)).size, collection.segment).toBe(10);
    }
  });
  it('oferece a categoria Outros para segmento desconhecido ou ausente', () => {
    for (const context of [{}, { businessSegment: 'SEGMENTO_DESCONHECIDO' }, { businessSegment: null }]) {
      expect(postAudience(context).category).toBe('outros');
      expect(availablePostTemplates(context).filter(template => template.businessCategory).map(template => template.businessCategory)).toEqual(Array(10).fill('outros'));
    }
  });
  it('mantém a advocacia isolada e as outras contas recebem apenas sua própria coleção', () => {
    const legal = availablePostTemplates({ businessSegment: 'LAW_FIRM' });
    expect(legal).toHaveLength(10);
    expect(legal.every(template => template.businessCategory === 'advocacia')).toBe(true);
    for (const collection of POST_CATEGORY_COLLECTIONS.filter(item => item.category !== 'advocacia')) {
      const templates = availablePostTemplates({ businessSegment: collection.segment });
      expect(templates.some(template => template.businessCategory === 'advocacia'), collection.segment).toBe(false);
      expect(templates.filter(template => template.businessCategory).every(template => template.businessCategory === collection.category), collection.segment).toBe(true);
    }
  });
  it('não usa fotos de beleza em categorias sem acervo adequado', () => {
    const permitted = new Set(['barbearia', 'salao', 'beleza']);
    for (const collection of POST_CATEGORY_COLLECTIONS) {
      const audience = postAudience({ businessSegment: collection.segment });
      if (!permitted.has(collection.category)) expect(audience.stock, collection.category).toBeUndefined();
      const templates = listPostTemplates().filter(template => template.businessCategory === collection.category);
      if (!permitted.has(collection.category) && collection.category !== 'advocacia') {
        expect(templates.every(template => !template.stockImageKey), collection.category).toBe(true);
      }
    }
  });
  it('oferece só dez modelos próprios para as novas categorias e preserva edição de legados', () => {
    const legacyCategories = new Set(['barbearia', 'salao', 'beleza']);
    const withoutSeparateEngine = (templates: ReturnType<typeof availablePostTemplates>) => templates.filter(template => template.key !== 'price-split');
    for (const collection of POST_CATEGORY_COLLECTIONS) {
      const context = { businessSegment: collection.segment };
      const normal = withoutSeparateEngine(availablePostTemplates(context));
      const historical = withoutSeparateEngine(availablePostTemplates(context, true));
      expect(normal, collection.segment).toHaveLength(legacyCategories.has(collection.category) ? 36 : 10);
      expect(historical.filter(template => template.businessCategory === collection.category), collection.segment).toHaveLength(10);
      if (!legacyCategories.has(collection.category)) expect(normal.every(template => template.businessCategory === collection.category), collection.segment).toBe(true);
    }
    expect(withoutSeparateEngine(availablePostTemplates({}))).toHaveLength(36);
    expect(withoutSeparateEngine(availablePostTemplates({ businessSegment: 'SEGMENTO_DESCONHECIDO' }))).toHaveLength(10);
    const nailStudio = { businessSegment: 'NAIL_STUDIO' };
    expect(availablePostTemplates(nailStudio).some(template => template.key === 'beleza-colecao-1')).toBe(false);
    expect(availablePostTemplates(nailStudio, false, true).some(template => template.key === 'beleza-colecao-1')).toBe(true);
    expect(availablePostTemplates({ businessSegment: 'PETSHOP' }, true).some(template => template.key === 'beleza-colecao-1')).toBe(false);
  });
  it('mantém contraste de texto de pelo menos 4.5:1 nos fundos, cartões e destaques', () => {
    const luminance = (hex: string) => {
      const rgb = hex.replace('#', '').match(/../g)!.map(channel => parseInt(channel, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const contrast = (foreground: string, background: string) => {
      const a = luminance(foreground), b = luminance(background);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    for (const palette of POST_PALETTES) {
      for (const color of [palette.foreground, palette.muted]) for (const background of [palette.surface, palette.background]) {
        expect(contrast(color, background), `${palette.key}: ${color}/${background}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(palette.accentForeground, palette.accent), `${palette.key}: destaque`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
