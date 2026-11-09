import { afterAll, describe, expect, it } from 'vitest';
import { closePostRenderPool } from '@/shared/infra/worker/postRenderPool';
import { buildPostSvg, renderPostSvgToPng } from './postImageService';
import { availablePostTemplates } from './postTemplates';
import { LEGAL_POST_TEMPLATES, legalPostMissingReason, legalPostReady, readLegalPost } from './legalPostTemplates';
import { LEGAL_POST_SAMPLES } from './legalPostSamples.fixture';
import { createPostSchema, legalPostSchema, previewPostQuerySchema, updatePostSchema } from '../schemas/postsSchemas';
import { renderSvgToPngSync } from './postSvgRenderer';

afterAll(() => closePostRenderPool());
const base = { shopName: 'Escritório de exemplo', services: [{ name: 'Serviço com preço', price: 999 }], todaySchedule: null, postMode: 'appointments' as const };
const inputFor = (index: number) => ({ ...base, ...LEGAL_POST_SAMPLES[index], designOptions: { legalPost: LEGAL_POST_SAMPLES[index].legalPost } });
const textOf = (svg: string) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m => m[1]).join(' ');
const textGroupsOf = (svg: string) => [...svg.matchAll(/<g data-legal-role="([^"]+)" data-x="([\d.]+)" data-y="([\d.]+)" data-width="([\d.]+)" data-height="([\d.]+)"[^>]*>(.*?)<\/g>/gs)]
  .map(m => ({ role: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5], markup: m[6] }));

describe('coleção editorial de advocacia', () => {
  it.each(['square', 'portrait', 'story'] as const)('centraliza os componentes e separa grupos de leitura em %s', format => {
    const map = buildPostSvg({ ...inputFor(1), format });
    const labels = textGroupsOf(map).filter(group => group.role === 'body');
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label.markup).toContain('text-anchor="middle"');
      const textX = Number(label.markup.match(/<text x="([\d.]+)"/)![1]);
      expect(textX).toBeCloseTo(label.x + label.w / 2);
    }

    for (const index of [3, 4, 5]) {
      const svg = buildPostSvg({ ...inputFor(index), format });
      const groups = textGroupsOf(svg);
      const title = groups.find(group => group.role === 'headline')!;
      const firstItem = groups.find(group => group.role === 'body')!;
      expect(firstItem.y - title.y - title.h).toBeGreaterThanOrEqual(32);
      const cta = groups.find(group => group.role === 'footer-cta')!;
      const contact = groups.find(group => group.role === 'footer-contact')!;
      expect(contact.y - cta.y - cta.h).toBeGreaterThanOrEqual(19.9);
    }

    const steps = textGroupsOf(buildPostSvg({ ...inputFor(4), format })).filter(group => group.role === 'step-number');
    expect(steps).toHaveLength(3);
    for (const step of steps) expect(step.markup).toContain('text-anchor="middle"');
  });

  it.each(['square', 'portrait', 'story'] as const)('centraliza o texto do perfil em relação ao retrato em %s', format => {
    const svg = buildPostSvg({ ...inputFor(8), format, primaryImageUrl: 'data:image/png;base64,eA==' });
    const groups = textGroupsOf(svg);
    const title = groups.find(group => group.role === 'headline')!;
    const summary = groups.find(group => group.role === 'summary')!;
    const photo = svg.match(/<image href="[^"]+" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]+clip-path="url\(#legalPortrait\)"/)!;
    expect(photo).not.toBeNull();
    expect((title.y + summary.y + summary.h) / 2).toBeCloseTo(Number(photo[2]) + Number(photo[4]) / 2);
    expect(Number(photo[3]) / Number(photo[4])).toBeLessThanOrEqual(0.8);
  });
  it('entrega dez finalidades para LAW_FIRM e mantém o catálogo dos outros segmentos', () => {
    const templates = availablePostTemplates({ businessSegment: 'LAW_FIRM' });
    expect(templates).toHaveLength(10);
    expect(templates.map(t => t.key)).toEqual(LEGAL_POST_TEMPLATES.map(t => t[0]));
    expect(templates.every(t => t.businessCategory === 'advocacia')).toBe(true);
    expect(availablePostTemplates({ businessSegment: 'BARBERSHOP' }).some(t => t.businessCategory === 'advocacia')).toBe(false);
    expect(templates.find(t => t.key === 'advocacia-perfil')?.stockImageKey).toBeUndefined();
  });
  it.each(['square', 'portrait', 'story'] as const)('preserva todos os contatos de posts antigos ou em modo completo em %s', format => {
    const input = inputFor(3);
    for (const contactLayout of [undefined, 'complete'] as const) {
      const legalPost = { ...input.legalPost, contactLayout };
      const svg = buildPostSvg({ ...input, format, designOptions: { legalPost } });
      const footer = textGroupsOf(svg).filter(group => group.role.startsWith('footer-')).map(group => textOf(group.markup)).join(' ');
      for (const value of [legalPost.contact, legalPost.website, legalPost.address]) expect(footer).toContain(value);
    }
  });
  it('troca o contato visível sem apagar telefone, endereço ou site armazenados', () => {
    const input = inputFor(3);
    const legalPost = legalPostSchema.parse(input.legalPost);
    const saved = structuredClone(legalPost);
    const svg = buildPostSvg({ ...input, designOptions: { legalPost } });
    expect(textOf(svg)).toContain(legalPost.contact);
    expect(textOf(svg)).not.toContain(legalPost.website);
    expect(legalPost).toEqual(saved);
    const withoutPhone = { ...legalPost, contact: '' };
    expect(textOf(buildPostSvg({ ...input, designOptions: { legalPost: withoutPhone } }))).toContain(legalPost.website);
    expect(legalPostSchema.safeParse({ ...legalPost, contactLayout: 'invalid' }).success).toBe(false);
  });
  it.each(['square', 'portrait', 'story'] as const)('mostra o nome completo uma única vez no perfil essencial em %s', format => {
    const input = inputFor(8);
    const svg = buildPostSvg({ ...input, format });
    expect(textOf(svg).split(input.legalPost.professionalName)).toHaveLength(2);
    expect(textOf(svg)).toContain(input.legalPost.registration);
    const customTitle = buildPostSvg({ ...input, title: 'Quem atende', format });
    expect(textOf(customTitle)).toContain(input.legalPost.professionalName);
    expect(textOf(customTitle)).toContain('Quem atende');
  });
  it.each(LEGAL_POST_SAMPLES.flatMap((sample, index) =>
    (['square', 'portrait', 'story'] as const).map(format => ({ templateKey: sample.templateKey, index, format }))
  ))('gera $templateKey em $format sem omitir texto nem reduzir leitura', ({ index, format }) => {
      const input = { ...inputFor(index), format };
      const svg = buildPostSvg(input);
      const text = textOf(svg);
      expect(text, input.templateKey).toContain(input.legalPost.professionalName);
      for (const key of ['registration', 'eyebrow', 'summary', 'highlight', 'contact'] as const) {
        const value = input.legalPost[key];
        if (value) expect(text, input.templateKey + ': ' + key).toContain(value);
      }
      if (input.legalPost.contactLayout === 'essential') {
        const footerText = textGroupsOf(svg).filter(group => group.role.startsWith('footer-')).map(group => textOf(group.markup)).join(' ');
        expect(footerText).toContain(input.legalPost.contact);
        expect(footerText).not.toContain(input.legalPost.address);
        expect(footerText).not.toContain(input.legalPost.website);
      }
      for (const area of input.legalPost.areas) {
        expect(text).toContain(area.title);
        for (const word of area.description.split(/\s+/).filter(Boolean)) expect(text.split(/\s+/)).toContain(word);
      }
      expect(text).not.toMatch(/R\$|Serviço com preço|undefined|NaN/);
      const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1]));
      expect(Math.min(...sizes), input.templateKey).toBeGreaterThanOrEqual(33);
      // 39px on the 1080px art remains 13px in a 360px mobile preview.
      const readingSizes = textGroupsOf(svg)
        .filter(group => !['monogram', 'decoration', 'step-number'].includes(group.role))
        .flatMap(group => [...group.markup.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1])));
      expect(Math.min(...readingSizes), `${input.templateKey}: leitura a 360px`).toBeGreaterThanOrEqual(39);
      const contentBottom = Number(svg.match(/data-legal-content-bottom="([\d.]+)"/)![1]);
      const footerTop = Number(svg.match(/data-legal-footer-top="([\d.]+)"/)![1]);
      expect(contentBottom, input.templateKey).toBeLessThan(footerTop - 10);
      const png = renderSvgToPngSync(svg);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1080);
      expect(png.readUInt32BE(20)).toBe(format === 'square' ? 1080 : format === 'portrait' ? 1350 : 1920);
  });
  it.each(['square', 'portrait', 'story'] as const)('mantém caixas de texto separadas e dentro das margens em %s', format => {
    for (let i = 0; i < LEGAL_POST_SAMPLES.length; i++) {
      const svg = buildPostSvg({ ...inputFor(i), format });
      const groups = textGroupsOf(svg).filter(group => !['monogram', 'decoration'].includes(group.role));
      const height = format === 'square' ? 1080 : format === 'portrait' ? 1350 : 1920;
      for (const a of groups) {
        expect(a.x, a.role).toBeGreaterThanOrEqual(60);
        expect(a.x + a.w, a.role).toBeLessThanOrEqual(1020);
        expect(a.y, a.role).toBeGreaterThanOrEqual(format === 'story' ? 170 : format === 'square' ? 48 : 52);
        expect(a.y + a.h, a.role).toBeLessThanOrEqual(height - (format === 'story' ? 190 : 40));
        for (const b of groups) {
          if (a === b) continue;
          const collision = a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
          expect(collision, `${LEGAL_POST_SAMPLES[i].templateKey}/${format}: ${a.role} × ${b.role}`).toBe(false);
        }
      }
    }
  });
  it('acomoda quatro áreas com linhas de alturas diferentes no quadrado, sem invadir o rodapé', () => {
    const input = inputFor(1);
    const legalPost = {
      ...input.legalPost,
      areas: [
        { title: 'Trabalho', description: '' },
        { title: 'Consumo', description: '' },
        { title: 'Contratos de trabalho', description: 'Condições e responsabilidades.' },
        { title: 'Relações de consumo', description: 'Compras e serviços.' },
      ],
    };
    const svg = buildPostSvg({ ...input, title: 'Áreas', format: 'square', designOptions: { legalPost } });
    const text = textOf(svg);
    for (const area of legalPost.areas) {
      expect(text).toContain(area.title);
      expect(text).toContain(area.description);
    }
    const cards = [...svg.matchAll(/<rect x="(?:64|558)" y="([\d.]+)" width="458" height="([\d.]+)" rx="4"/g)]
      .map(m => ({ y: +m[1], h: +m[2] }));
    expect(cards).toHaveLength(4);
    expect(cards[2].h).toBeGreaterThan(cards[0].h);
    expect(cards[0].y + cards[0].h).toBeLessThan(cards[2].y);
    const footerTop = Number(svg.match(/data-legal-footer-top="([\d.]+)"/)![1]);
    expect(cards[2].y + cards[2].h).toBeLessThan(footerTop - 10);
    for (const group of textGroupsOf(svg).filter(group => group.role === 'body')) {
      expect(cards.some(card => group.y >= card.y && group.y + group.h <= card.y + card.h)).toBe(true);
    }
  });
  it.each(['square', 'portrait', 'story'] as const)('reserva a quebra real do CTA em negrito no rodapé em %s', format => {
    const input = inputFor(7);
    // Fits in one line in regular Inter, but needs two in the bold face actually drawn.
    const ctaText = 'Confirme os documentos pelo canal do escritório';
    const legalPost = { ...input.legalPost, areas: [], summary: '' };
    const svg = buildPostSvg({ ...input, title: 'Contato', ctaText, format, designOptions: { legalPost } });
    const groups = textGroupsOf(svg);
    const cta = groups.find(group => group.role === 'footer-cta')!;
    expect([...cta.markup.matchAll(/<text\b/g)]).toHaveLength(2);
    expect(textOf(cta.markup)).toBe(ctaText);
    const footer = groups.filter(group => group.role.startsWith('footer-'));
    const height = format === 'square' ? 1080 : format === 'portrait' ? 1350 : 1920;
    const bottom = format === 'story' ? 206 : format === 'square' ? 48 : 52;
    expect(Math.max(...footer.map(group => group.y + group.h))).toBeLessThanOrEqual(height - bottom);
    for (let i = 1; i < footer.length; i++) expect(footer[i].y).toBeGreaterThan(footer[i - 1].y + footer[i - 1].h);
  });
  it('preserva descrições preenchidas na Identidade em vez de removê-las em favor da foto', () => {
    const input = inputFor(0);
    const legalPost = { ...input.legalPost, areas: [{ title: 'Trabalho', description: 'Contratos e relações de trabalho.' }, { title: 'Consumo', description: 'Documentos e relações de consumo.' }] };
    for (const format of ['portrait', 'story'] as const) {
      const text = textOf(buildPostSvg({ ...input, format, designOptions: { legalPost } }));
      for (const area of legalPost.areas) expect(text).toContain(area.description);
    }
  });
  it('rejeita excesso de conteúdo com uma mensagem acionável em vez de texto minúsculo', () => {
    const input = inputFor(0);
    const legalPost = { ...input.legalPost, professionalName: 'W'.repeat(90), areas: Array.from({ length: 4 }, () => ({ title: 'W'.repeat(50), description: 'W'.repeat(140) })) };
    for (const format of ['square', 'portrait', 'story'] as const) expect(() => buildPostSvg({ ...input, format, designOptions: { legalPost } })).toThrow('O texto ficou longo');
  });
  it.each(['square', 'portrait', 'story'] as const)('preserva uma foto própria no Perfil e usa monograma quando não há foto em %s', format => {
    const input = { ...inputFor(8), format };
    const photo = 'data:image/png;base64,iVBORw0KGgo=';
    expect(buildPostSvg({ ...input, primaryImageUrl: photo })).toContain('href="' + photo + '"');
    expect(buildPostSvg(input)).not.toContain('<image');
  });
  it('valida quatro blocos e os novos campos, preservando drafts sem eles', () => {
    const data = inputFor(1).legalPost;
    expect(legalPostSchema.safeParse(data).success).toBe(true);
    expect(legalPostReady(data)).toBe(true);
    expect(legalPostReady({ ...data, registration: ' ' })).toBe(false);
    expect(legalPostSchema.safeParse({ ...data, areas: [...data.areas, data.areas[0]] }).success).toBe(false);
    for (const [key, max] of [['eyebrow', 40], ['summary', 160], ['highlight', 60]] as const) {
      expect(legalPostSchema.safeParse({ ...data, [key]: 'x'.repeat(max) }).success).toBe(true);
      expect(legalPostSchema.safeParse({ ...data, [key]: 'x'.repeat(max + 1) }).success).toBe(false);
    }
    expect(legalPostSchema.safeParse({ professionalName: '', registration: '', areas: [] }).success).toBe(true);
    for (const sample of LEGAL_POST_SAMPLES) expect(legalPostSchema.safeParse(sample.legalPost).success).toBe(true);
  });
  it('valida o conteúdo necessário para publicar conforme a finalidade do modelo', () => {
    const identity = { professionalName: 'Profissional Exemplo', registration: 'OAB/UF 00000', areas: [] };
    expect(legalPostReady({ ...identity, summary: 'Uma resposta informativa.' }, 'advocacia-trabalhista')).toBe(true);
    expect(legalPostReady({ ...identity, highlight: 'Uma resposta em destaque.' }, 'advocacia-trabalhista')).toBe(true);
    expect(legalPostMissingReason(identity, 'advocacia-trabalhista')).toContain('resposta');
    expect(legalPostReady({ ...identity, highlight: '23 NOV' }, 'advocacia-comunicado')).toBe(true);
    expect(legalPostMissingReason({ ...identity, summary: 'Horário especial.' }, 'advocacia-comunicado')).toContain('data');
    expect(legalPostReady({ ...identity, summary: 'Apresentação fornecida pelo profissional.' }, 'advocacia-perfil')).toBe(true);
    expect(legalPostMissingReason(identity, 'advocacia-perfil')).toContain('apresentação');
    expect(legalPostReady({ ...identity, summary: 'Trabalho ou contratos?' }, 'advocacia-contratos')).toBe(true);
    expect(legalPostMissingReason(identity, 'advocacia-contratos')).toContain('participar');
    expect(legalPostMissingReason(identity, 'advocacia-areas')).toContain('bloco');
    for (const sample of LEGAL_POST_SAMPLES) {
      expect(legalPostReady(sample.legalPost, sample.templateKey), sample.templateKey).toBe(true);
      expect(legalPostReady({ ...sample.legalPost, registration: ' ' }, sample.templateKey)).toBe(false);
      expect(legalPostReady({ ...sample.legalPost, professionalName: ' ' }, sample.templateKey)).toBe(false);
    }
  });
  it.each([undefined, {}, { focalX: 50 }, { legalPost: null }])('recusa identificação jurídica ausente sem lançar TypeError (%j)', options => {
    const data = readLegalPost(options);
    expect(legalPostMissingReason(data, 'advocacia-cartao')).toContain('nome profissional');
    expect(legalPostMissingReason(data, 'advocacia-cartao')).toContain('inscrição na OAB');
    expect(legalPostReady(data, 'advocacia-cartao')).toBe(false);
  });
  it('aceita na prévia os mesmos limites de título e CTA aceitos ao salvar e editar', () => {
    const base = { barbershopId: '00000000-0000-4000-8000-000000000001', type: 'announcement' };
    for (const [key, max] of [['title', 200], ['ctaText', 120]] as const) {
      for (const schema of [previewPostQuerySchema, createPostSchema, updatePostSchema]) {
        expect(schema.safeParse({ ...base, [key]: 'A'.repeat(max) }).success, key).toBe(true);
        expect(schema.safeParse({ ...base, [key]: 'A'.repeat(max + 1) }).success, key).toBe(false);
      }
    }
  });
  it('escapa identificação e conteúdo livre em XML, sem inventar inscrição', () => {
    const input = inputFor(0);
    const svg = buildPostSvg({ ...input, designOptions: { legalPost: { ...input.legalPost, professionalName: '<script>& Escritório', summary: '<b> & exemplo' } } });
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).toContain('&lt;b&gt; &amp;');
    expect(svg).not.toContain('<script>');
    expect(buildPostSvg({ ...input, designOptions: undefined })).toContain('Inscrição profissional');
  });
  it('mantém palavras completas no título e evita conjunção isolada', () => {
    for (let i = 0; i < LEGAL_POST_SAMPLES.length; i++) for (const format of ['square', 'portrait', 'story'] as const) {
      const input = inputFor(i);
      const svg = buildPostSvg({ ...input, format });
      const lines = [...svg.matchAll(/<g data-legal-role="headline"[^>]*>(.*?)<\/g>/gs)].flatMap(m => [...m[1].matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(t => t[1]));
      for (const word of input.title.split(/\s+/)) expect(lines.some(line => line.split(/\s+/).includes(word)), input.templateKey + ': ' + word).toBe(true);
      expect(lines.some(line => /^(e|o|a|de|do|da)$/i.test(line))).toBe(false);
    }
  });
  it('renderiza com as mesmas fontes no worker e no processo local', async () => {
    const svg = buildPostSvg(inputFor(0));
    expect(Buffer.compare(renderSvgToPngSync(svg), await renderPostSvgToPng(svg))).toBe(0);
  });
});
