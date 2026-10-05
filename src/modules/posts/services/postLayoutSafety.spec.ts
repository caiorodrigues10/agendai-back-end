import { buildPostSvg, postLayoutMetrics, type PostSvgInput } from './postImageService';
import { listPostTemplates } from './postTemplates';
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

it.each(listPostTemplates().map(template => [template.key]))('%s reserva espaço para CTA mesmo com logo e título longo', key => {
  for (const format of ['square', 'portrait', 'story'] as const) {
    const input: PostSvgInput = {
      shopName: 'Studio Aurora', logoUrl: PHOTO, templateKey: key, format,
      services: [{ name: 'Coloração Premium Completa', price: 189.9 }, { name: 'Corte Editorial Masculino', price: 95 }],
      todaySchedule: { isOpen: false, openTime: '', closeTime: '' }, postMode: 'appointments',
      ctaText: 'Agendar', title: 'Seu próximo momento de cuidado começa aqui',
      primaryImageUrl: PHOTO, secondaryImageUrl: PHOTO, designOptions: { focalX: 0, focalY: 100 },
    };
    const metrics = postLayoutMetrics(input);
    const svg = buildPostSvg(input);
    for (const match of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      if (match[2].includes('agendai.app') || match[2] === 'Agendar') continue;
      const y = Number(match[1].match(/\by="([\d.]+)"/)?.[1]);
      expect(y, `${key}/${format}: ${match[2]}`).toBeLessThanOrEqual(metrics.ctaY - 24);
    }
  }
});
