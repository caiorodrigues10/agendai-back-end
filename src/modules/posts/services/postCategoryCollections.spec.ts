import { describe, expect, it } from 'vitest';
import { ALL_SEGMENTS } from '@/shared/segments';
import { POST_CATEGORY_COLLECTIONS, postCategoryForSegment } from './postCategoryCollections';

describe('postCategoryCollections — segment-aware editorial catalog', () => {
  it('covers every registered segment exactly once without merging distinct categories', () => {
    expect(POST_CATEGORY_COLLECTIONS).toHaveLength(23);
    expect(POST_CATEGORY_COLLECTIONS.map(collection => collection.segment).sort()).toEqual([...ALL_SEGMENTS].sort());
    expect(new Set(POST_CATEGORY_COLLECTIONS.map(collection => collection.segment)).size).toBe(23);
    expect(new Set(POST_CATEGORY_COLLECTIONS.map(collection => collection.category)).size).toBe(23);
  });

  it('preserves the four category identifiers already stored in posts', () => {
    expect(postCategoryForSegment('BARBERSHOP').category).toBe('barbearia');
    expect(postCategoryForSegment('HAIR_SALON').category).toBe('salao');
    expect(postCategoryForSegment('BEAUTY_STUDIO').category).toBe('beleza');
    expect(postCategoryForSegment('LAW_FIRM').category).toBe('advocacia');
  });

  it.each(POST_CATEGORY_COLLECTIONS)('$segment has ten distinct, short editorial titles or retains the dedicated legal catalog', collection => {
    expect(collection.category).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    expect(collection.label.trim().length).toBeGreaterThan(0);
    if (collection.segment === 'LAW_FIRM') {
      expect(collection.titles).toHaveLength(0);
      return;
    }
    expect(collection.titles).toHaveLength(10);
    expect(new Set(collection.titles.map(title => title.toLocaleLowerCase('pt-BR'))).size).toBe(10);
    for (const title of collection.titles) {
      expect(title.trim()).toBe(title);
      expect(title.length).toBeGreaterThan(0);
      expect(Array.from(title).length).toBeLessThanOrEqual(40);
      expect(title).not.toMatch(/R\$|\d+\s*%|garantid|\bcura\b|depoimento|resultado comprovado/i);
    }
  });

  it('does not give another profession an unrelated barber, salon or beauty photograph', () => {
    const withStock = POST_CATEGORY_COLLECTIONS.filter(collection => 'stock' in collection);
    expect(withStock.map(collection => collection.segment).sort()).toEqual(['BARBERSHOP', 'BEAUTY_STUDIO', 'HAIR_SALON']);
  });

  it.each(POST_CATEGORY_COLLECTIONS)('$segment provides bounded, unique illustrative service names', collection => {
    expect(collection.subjects.length).toBeLessThanOrEqual(10);
    expect(new Set(collection.subjects).size).toBe(collection.subjects.length);
    if (collection.segment !== 'LAW_FIRM') expect(collection.subjects.length).toBeGreaterThan(0);
    for (const subject of collection.subjects) {
      expect(subject.trim()).toBe(subject);
      expect(subject.length).toBeGreaterThan(0);
      expect(subject).not.toMatch(/R\$|\d+\s*%|garantid|\bcura\b|diagnóstico de doença/i);
    }
  });

  it.each([undefined, null, '', 'UNKNOWN_SEGMENT', 'toString', '__proto__'])('uses the neutral collection for an unrecognized segment: %s', segment => {
    expect(postCategoryForSegment(segment).segment).toBe('OTHER');
    expect(postCategoryForSegment(segment).category).toBe('outros');
  });
});
