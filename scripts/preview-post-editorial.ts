import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildPostSvg } from '../src/modules/posts/services/postImageService';
import { renderSvgToPngSync } from '../src/modules/posts/services/postSvgRenderer';
import { POST_TEMPLATES, listPostTemplates } from '../src/modules/posts/services/postTemplates';
import { loadPostStockImage } from '../src/modules/posts/services/postStockImages';

// Local QA only: illustrative fixtures, no API/database credentials or network writes.
async function main() {
  const out = process.argv[2];
  if (!out || !path.isAbsolute(out)) throw new Error('Informe um diretório absoluto para as imagens de QA');
  mkdirSync(out, { recursive: true });
  const groups = new Map<string, Buffer[]>();
  const cards: string[] = [];
  for (const [row, template] of POST_TEMPLATES.entries()) {
    const legal = template.businessCategory === 'advocacia';
    for (const format of ['square', 'portrait', 'story'] as const) {
      const png = renderSvgToPngSync(buildPostSvg({
        shopName: legal ? 'Escritório Exemplo' : 'Studio Aurora', logoUrl: null, templateKey: template.key, format,
        paletteKey: row % 2 ? 'clara' : 'brand', title: template.sampleTitle || 'Seu próximo momento de cuidado começa aqui',
        ctaText: legal ? 'Informações e contato' : 'Reserve seu horário', postMode: 'appointments',
        services: [{ name: 'Corte e finalização', price: 85 }, { name: 'Barba', price: 35 }],
        todaySchedule: { isOpen: true, openTime: '09:00', closeTime: '19:00' },
        primaryImageUrl: template.photoMode === 'none' ? null : loadPostStockImage(template.stockImageKey ?? 'salon'),
        secondaryImageUrl: template.requiredMedia === 2 ? loadPostStockImage('barber') : null,
        illustrativeBackground: Boolean(template.stockImageKey?.startsWith('promo-')),
        designOptions: legal ? { legalPost: { professionalName: 'Escritório Exemplo', registration: 'OAB/UF · exemplo', areas: [{ title: 'Áreas de atuação', description: 'Informações sobre os temas atendidos pelo escritório.' }], contact: '(00) 00000-0000' } } : undefined,
      }));
      const file = template.key + '-' + format + '.png';
      writeFileSync(path.join(out, file), png);
      cards.push('<figure><img loading="lazy" src="' + file + '" alt="' + template.name + '"><figcaption>' + template.name + ' · ' + format + '</figcaption></figure>');
      if (format === 'portrait') {
        const key = template.businessCategory ?? 'gerais';
        const images = groups.get(key) ?? [];
        const thumb = await sharp(png).resize(270, 338).png().toBuffer();
        const label = Buffer.from('<svg width="270" height="38"><rect width="270" height="38" fill="#e7e7e7"/><text x="6" y="23" font-size="12">' + template.key + '</text></svg>');
        images.push(await sharp({ create: { width: 270, height: 376, channels: 4, background: '#e7e7e7' } }).composite([{ input: thumb, left: 0, top: 0 }, { input: label, left: 0, top: 338 }]).png().toBuffer());
        groups.set(key, images);
      }
    }
  }
  for (const [category, images] of groups) {
    const cols = 5, width = cols * 286 - 16, height = Math.ceil(images.length / cols) * 392 - 16;
    await sharp({ create: { width, height, channels: 4, background: '#dedede' } }).composite(images.map((input, index) => ({ input, left: (index % cols) * 286, top: Math.floor(index / cols) * 392 }))).png().toFile(path.join(out, 'categoria-' + category + '.png'));
  }
  writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(listPostTemplates(), null, 2));
  writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Revisão dos posts</title><style>body{font:16px system-ui;background:#eee;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}figure{margin:0}img{width:100%;height:auto}figcaption{padding:10px 0}</style><h1>Revisão de todos os modelos</h1><p>Dados ilustrativos para QA. Nenhum post foi publicado.</p><main>' + cards.join('') + '</main>');
  console.log('Rendered ' + POST_TEMPLATES.length * 3 + ' images in ' + out);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
