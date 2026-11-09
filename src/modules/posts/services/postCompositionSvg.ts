import metrics from './legalFontMetrics.json';
import { AppError } from '@/shared/errors/AppError';
import { BRAND_NAME } from '@/config/brand';
import { getPostPalette } from './postPalettes';
import type { PostSvgInput } from './postImageService';

type Font = 'sans' | 'sansBold';
type Template = { key: string; businessCategory?: string; layoutVariant?: number; photoMode?: string };
type Mode = 'cover' | 'service' | 'steps' | 'agenda' | 'guide' | 'prepare' | 'menu' | 'question' | 'team' | 'notice' | 'comparison' | 'result' | 'quote';
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const error = () => new AppError('O conteúdo não cabe com leitura confortável neste formato. Resuma o texto ou escolha Retrato ou Story.', 400);
function width(value: string, size: number, font: Font) {
  const glyphs = metrics[font].advance as Record<string, number>;
  return Array.from(value).reduce((sum, char) => sum + (glyphs[String(char.codePointAt(0))] ?? 1) * size * 1.025, 0);
}
function lines(value: string, w: number, size: number, font: Font): string[] {
  const output: string[] = [];
  for (const paragraph of value.trim().split('\n')) {
    let row = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (width(word, size, font) > w) throw error();
      if (row && width(`${row} ${word}`, size, font) > w) { output.push(row); row = word; }
      else row = row ? `${row} ${word}` : word;
    }
    if (row) output.push(row);
  }
  return output;
}
const textH = (value: string, w: number, size: number, font: Font = 'sansBold') => lines(value, w, size, font).length * size * 1.24;
function titleSize(value: string, w: number, budget: number, target: number) {
  let firstFit: number | undefined;
  for (let size = target; size >= 54; size -= 2) {
    try {
      const rows = lines(value, w, size, 'sansBold');
      if (rows.length * size * 1.24 > budget) continue;
      firstFit ??= size;
      if (value.includes('\n') || !rows.some(row => /^(?:a|o|e|de|do|da|em|no|na|com|para)$/i.test(row))) return size;
    } catch { /* Try a smaller headline, keeping all words. */ }
  }
  if (firstFit !== undefined) return firstFit;
  throw error();
}
class Canvas {
  nodes: string[] = [];
  rect(x: number, y: number, w: number, h: number, color: string, radius = 0) {
    if (h < 0) throw error();
    this.nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${color}"/>`);
  }
  line(x: number, y: number, w: number, color: string) { this.nodes.push(`<path d="M${x} ${y}h${w}" fill="none" stroke="${color}" stroke-width="2"/>`); }
  text(value: string, x: number, y: number, w: number, size: number, color: string, role: string, align: 'left' | 'center' = 'left', font: Font = 'sansBold') {
    const rows = lines(value, w, size, font);
    if (!rows.length) return y;
    const h = rows.length * size * 1.24;
    this.nodes.push(`<g data-post-role="${role}" data-x="${x}" data-y="${y}" data-width="${w}" data-height="${h}">`);
    rows.forEach((row, i) => this.nodes.push(`<text x="${align === 'center' ? x + w / 2 : x}" y="${y + size * .84 + i * size * 1.24}"${align === 'center' ? ' text-anchor="middle"' : ''} font-family="Inter" font-size="${size}" font-weight="${font === 'sansBold' ? 700 : 400}" fill="${color}">${xml(row)}</text>`));
    this.nodes.push('</g>');
    return y + h;
  }
  photo(url: string | null | undefined, x: number, y: number, w: number, h: number, id: string, focalX: number, focalY: number, overlay = 0) {
    if (!url?.startsWith('data:image') || h < 24) return false;
    const zoom = id === 'brand-logo' ? 1 : 1.15;
    const iw = w * zoom, ih = h * zoom;
    const ix = x - (iw - w) * Math.max(0, Math.min(100, focalX)) / 100;
    const iy = y - (ih - h) * Math.max(0, Math.min(100, focalY)) / 100;
    this.nodes.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16"/></clipPath><image data-post-photo="${id}" href="${xml(url)}" x="${ix}" y="${iy}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid ${id === 'brand-logo' ? 'meet' : 'slice'}" clip-path="url(#${id})"/>`);
    if (overlay && id !== 'brand-logo') this.nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#000" opacity="${Math.max(0, Math.min(.6, overlay / 100))}"/>`);
    return true;
  }
}
const modes: Mode[] = ['cover', 'service', 'steps', 'agenda', 'guide', 'prepare', 'menu', 'question', 'team', 'notice'];
const legacyModes: Record<string, Mode> = {
  'agenda-aberta': 'agenda', 'ultimas-vagas': 'agenda', 'agenda-premium': 'agenda',
  'promocao-relampago': 'service', 'servico-destaque': 'service', 'oferta-clean': 'service', 'promocao-cobre': 'service', 'combo-premium': 'service', 'beleza-luxo': 'service', 'gift-card': 'service',
  'antes-depois': 'comparison', transformacao: 'result', 'profissional-destaque': 'team', depoimento: 'quote', 'avaliacao-clientes': 'quote',
  'menu-servicos': 'menu', 'horario-especial': 'notice', 'recado-studio': 'notice', novidade: 'cover', 'lancamento-premium': 'cover',
  'editorial-minimalista': 'result', 'editorial-foto': 'cover', 'capa-impacto': 'prepare', 'revista-beleza': 'team', tipografico: 'question', fidelidade: 'guide',
};
const prices = new Set(['promocao-relampago', 'servico-destaque', 'oferta-clean', 'promocao-cobre', 'combo-premium', 'beleza-luxo', 'gift-card', 'menu-servicos']);
function illustration(category: string, x: number, y: number, size: number, color: string) {
  const kind = ['petshop', 'veterinaria'].includes(category) ? 'paw'
    : ['lava-jato', 'oficina'].includes(category) ? 'car'
    : ['fisioterapia', 'nutricao', 'psicologia', 'estetica', 'spa'].includes(category) ? 'care'
    : category === 'fotografia' ? 'camera' : ['aulas', 'consultoria'].includes(category) ? 'book'
    : ['assistencia-tecnica', 'servicos-domiciliares'].includes(category) ? 'tools'
    : category === 'barbearia' || category === 'salao' ? 'scissors' : 'spark';
  const paths: Record<string, string> = {
    paw: '<ellipse cx="50" cy="66" rx="24" ry="18"/><ellipse cx="24" cy="40" rx="8" ry="11"/><ellipse cx="43" cy="26" rx="8" ry="11"/><ellipse cx="63" cy="26" rx="8" ry="11"/><ellipse cx="80" cy="42" rx="8" ry="11"/>',
    car: '<path d="M18 58l9-25h46l10 25v21H18Z M21 54h58 M30 68h8 M64 68h8 M28 79v8 M73 79v8"/>',
    care: '<path d="M50 83S12 59 12 34C12 14 39 10 50 28c11-18 38-14 38 6 0 25-38 49-38 49Z M25 49h14l7-14 9 28 8-14h12"/>',
    camera: '<rect x="12" y="28" width="76" height="54" rx="8"/><circle cx="50" cy="55" r="17"/><path d="M29 28l7-12h28l7 12"/>',
    book: '<path d="M50 27Q31 12 12 22v57q19-10 38 5 19-15 38-5V22Q69 12 50 27v57 M23 36l15 5 M23 50l15 5 M62 41l15-5 M62 55l15-5"/>',
    tools: '<path d="M31 18a23 23 0 0030 30l24 24-14 14-24-24A23 23 0 0118 32l17 17 14-14Z"/>',
    scissors: '<circle cx="27" cy="73" r="13"/><circle cx="73" cy="73" r="13"/><path d="M36 64l43-47 M64 64L21 17 M50 49l4 4"/>',
    spark: '<path d="M50 10l11 29 29 11-29 11-11 29-11-29-29-11 29-11Z M82 12v17 M74 20h17"/>',
  };
  return `<g data-post-illustration="${kind}" transform="translate(${x} ${y}) scale(${size / 100})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</g>`;
}

export function postCompositionMetrics(input: PostSvgInput) {
  const format = input.format ?? 'square';
  const height = format === 'story' ? 1920 : format === 'portrait' ? 1350 : 1080;
  const top = format === 'story' ? 178 : 56;
  const bottom = format === 'story' ? 206 : 52;
  const nameH = textH(input.shopName.toUpperCase(), input.logoUrl?.startsWith('data:image') ? 828 : 952, 40);
  const headerH = Math.max(input.logoUrl?.startsWith('data:image') ? 88 : 0, nameH);
  const ctaH = textH(input.ctaText.trim() || 'Agendar atendimento', 952, 40);
  const footerH = 36 + ctaH + 24 + 30;
  const ctaY = height - bottom - footerH;
  return { height, shopY: top + 33.6, top: top + headerH + (format === 'story' ? 80 : 56), ctaY, footerY: height - bottom - 30, headerTop: top, headerH, ctaH, bottom };
}

/** Measured compositions for every non-legal category and legacy key. */
export function buildPostCompositionSvg(input: PostSvgInput, template: Template, version: number) {
  const m = postCompositionMetrics(input);
  let p = getPostPalette(input.paletteKey);
  if ((!input.paletteKey || input.paletteKey === 'brand') && template.key === 'promocao-cobre') p = { ...p, background: '#191512', surface: '#30231C', foreground: '#F7EFE8', muted: '#D4C4B7', accent: '#D99563' };
  if ((!input.paletteKey || input.paletteKey === 'brand') && template.key === 'beleza-luxo') p = { ...p, background: '#F5EFE7', surface: '#E9DFD2', foreground: '#302A24', muted: '#62564B', accent: '#795335', border: '#BFAE9C', isLight: true };
  const art = new Canvas();
  const category = template.businessCategory ?? 'outros';
  const mode = template.layoutVariant === undefined ? legacyModes[template.key] ?? 'agenda' : modes[template.layoutVariant % 10];
  const story = input.format === 'story';
  const gap = story ? 64 : 40;
  const start = m.top;
  const end = m.ctaY - (story ? 72 : 48);
  const available = end - start;
  const title = input.title.trim() || 'Conheça nossos serviços';
  const services = input.services.filter(service => service.name.trim());
  const image = template.photoMode === 'none' ? null : input.primaryImageUrl;
  const hasImage = Boolean(image?.startsWith('data:image'));
  const fx = input.designOptions?.focalX ?? 50, fy = input.designOptions?.focalY ?? 50;
  const paintPhoto = (x: number, y: number, w: number, h: number, id: string, source = image) => art.photo(source, x, y, w, h, id, fx, fy, input.designOptions?.overlay ?? 0);
  const heading = (y: number, maxH: number, opts: { x?: number; w?: number; target?: number; center?: boolean } = {}) => {
    const x = opts.x ?? 64, w = opts.w ?? 952;
    return art.text(title, x, y, w, titleSize(title, w, maxH, opts.target ?? (story ? 112 : 86)), p.foreground, 'headline', opts.center ? 'center' : 'left');
  };
  const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  art.rect(0, 0, 1080, m.height, p.background);
  art.rect(64, m.headerTop - 18, 72, 4, p.accent);
  if (input.logoUrl?.startsWith('data:image')) paintPhoto(64, m.headerTop + (m.headerH - 88) / 2, 88, 88, 'brand-logo', input.logoUrl);
  art.text(input.shopName.toUpperCase(), input.logoUrl?.startsWith('data:image') ? 188 : 64, m.headerTop + (m.headerH - textH(input.shopName.toUpperCase(), input.logoUrl?.startsWith('data:image') ? 828 : 952, 40)) / 2, input.logoUrl?.startsWith('data:image') ? 828 : 952, 40, p.foreground, 'brand');

  if (mode === 'comparison') {
    const size = titleSize(title, 952, available - 220, story ? 102 : 72);
    let y = art.text(title, 64, start, 952, size, p.foreground, 'headline') + gap;
    const photoH = end - y - 36 * 1.24 - 24;
    if (photoH < 140) throw error();
    for (const [i, source] of [input.primaryImageUrl, input.secondaryImageUrl].entries()) {
      const x = 64 + i * 496;
      art.rect(x, y, 456, photoH, p.surface, 16);
      paintPhoto(x, y, 456, photoH, `comparison-${i}`, source);
      art.text(i ? 'DEPOIS' : 'ANTES', x, y + photoH + 24, 456, 36, p.foreground, 'photo-label', 'center');
    }
  } else if (mode === 'menu' && services.length) {
    const showPrice = prices.has(template.key);
    const rowW = showPrice ? 624 : 824;
    const labelSize = story ? 48 : 44;
    const rowGap = story ? 28 : 20;
    const rowHeights = services.map(s => Math.max(64, textH(s.name, rowW, labelSize, 'sans') + 32, showPrice ? textH(money(s.price), 236, 42) + 32 : 0));
    const listH = rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, services.length - 1) * rowGap;
    const size = titleSize(title, 952, available - listH - gap, story ? 100 : 76);
    const groupHeight = textH(title, 952, size) + gap + listH;
    const extra = Math.min(32, Math.max(0, (available - groupHeight) / services.length));
    const groupTop = start + Math.max(0, (available - groupHeight - extra * services.length) / 2);
    let y = art.text(title, 64, groupTop, 952, size, p.foreground, 'headline') + gap;
    services.forEach((service, i) => {
      const h = rowHeights[i] + extra;
      art.rect(64, y, 952, h, p.surface, 12);
      art.text(service.name, 96, y + (h - textH(service.name, rowW, labelSize, 'sans')) / 2, rowW, labelSize, p.foreground, 'service-name', 'left', 'sans');
      if (showPrice) art.text(money(service.price), 748, y + (h - textH(money(service.price), 236, 42)) / 2, 236, 42, p.accent, 'price', 'center');
      y += h + rowGap;
    });
  } else if (mode === 'service') {
    const service = services[0];
    const showName = service && !title.toLocaleLowerCase('pt-BR').includes(service.name.toLocaleLowerCase('pt-BR'));
    const priced = Boolean(service && prices.has(template.key));
    const measureOffer = (w: number, budget: number, priceTarget: number) => {
      let ps = priceTarget;
      if (priced) while (ps > 64 && width(money(service!.price), ps, 'sansBold') > w) ps -= 2;
      const nh = showName ? textH(service.name, w, 42, 'sans') : 0;
      const ph = priced ? textH(money(service!.price), w, ps) : 0;
      const supportH = (nh ? gap + nh : 0) + (ph ? 28 + ph : 0);
      const ts = titleSize(title, w, budget - supportH, story ? 104 : 80);
      return { priceSize: ps, titleSize: ts, blockH: textH(title, w, ts) + supportH };
    };
    const drawOffer = (x: number, y: number, w: number, budget: number, center = false, priceTarget = story ? 144 : 108) => {
      const { priceSize: ps, titleSize: ts, blockH } = measureOffer(w, budget, priceTarget);
      let at = y + Math.max(0, (budget - blockH) / 2);
      at = art.text(title, x, at, w, ts, p.foreground, 'headline', center ? 'center' : 'left');
      if (showName) at = art.text(service.name, x, at + gap, w, 42, p.muted, 'service-name', center ? 'center' : 'left', 'sans');
      if (priced) at = art.text(money(service!.price), x, at + 28, w, ps, p.accent, 'price', center ? 'center' : 'left');
      if (at > end + 1) throw error();
    };
    const square = !input.format || input.format === 'square';
    let squareColumns = false;
    if (square && hasImage && template.key === 'oferta-clean') {
      try {
        measureOffer(532, available, 82);
        squareColumns = true;
      } catch (err) {
        if (!(err instanceof AppError) || err.statusCode !== 400) throw err;
      }
    }
    if (['oferta-clean', 'combo-premium'].includes(template.key) && (!square || squareColumns)) {
      const reverse = template.key === 'combo-premium';
      const photoX = reverse ? 64 : squareColumns ? 642 : 586, textX = reverse ? 564 : 64;
      const columnW = reverse ? 452 : squareColumns ? 532 : 466;
      const photoW = squareColumns ? 374 : 430;
      art.rect(photoX, start, photoW, available, p.surface, 16);
      if (!paintPhoto(photoX, start, photoW, available, 'offer-column')) art.nodes.push(illustration(category, photoX + 100, start + (available - 230) / 2, 230, p.accent));
      drawOffer(textX, start, columnW, available, false, story ? 102 : 82);
    } else if (template.key === 'gift-card') {
      const photoH = hasImage ? Math.min(available * .18, story ? 260 : 120) : 0;
      if (hasImage) paintPhoto(64, start, 952, photoH, 'gift-photo');
      const cardY = start + (photoH ? photoH + gap : 0);
      art.rect(64, cardY, 952, end - cardY, p.surface, 24);
      art.line(64, cardY + 24, 952, p.accent);
      drawOffer(112, cardY + 32, 856, end - cardY - 64, true, story ? 132 : 94);
    } else if (template.key === 'beleza-luxo') {
      const photoH = hasImage ? Math.min(available * .28, story ? 360 : 180) : 0;
      if (hasImage) paintPhoto(144, start, 792, photoH, 'beauty-photo');
      const textY = start + (photoH ? photoH + gap : 0);
      drawOffer(64, textY, 952, end - textY, true);
    } else if (template.key === 'promocao-relampago') {
      const photoH = hasImage ? Math.min(available * .25, story ? 360 : 150) : 0;
      drawOffer(64, start, 952, available - (photoH ? photoH + gap : 0), true);
      if (hasImage) paintPhoto(64, end - photoH, 952, photoH, 'campaign-photo');
    } else {
      const photoHeight = hasImage ? Math.min(story ? 480 : input.format === 'portrait' ? 320 : 200, available * .32) : 0;
      if (photoHeight) paintPhoto(64, start, 952, photoHeight, 'service-photo');
      const textTop = start + (photoHeight ? photoHeight + gap : 0);
      drawOffer(64, textTop, 952, end - textTop);
    }
  } else if (mode === 'agenda' || mode === 'notice') {
    const schedule = input.todaySchedule?.isOpen ? `${input.todaySchedule.openTime} às ${input.todaySchedule.closeTime}` : 'Consulte os horários';
    const scheduleSize = story ? 76 : 58;
    const panelH = textH(schedule, 856, scheduleSize) + 96;
    const size = titleSize(title, 952, available - panelH - gap, story ? 118 : 88);
    const groupH = textH(title, 952, size) + gap + panelH;
    const y = start + Math.max(0, (available - groupH) / 2);
    const titleEnd = art.text(title, 64, y, 952, size, p.foreground, 'headline', mode === 'notice' ? 'center' : 'left');
    const panelY = titleEnd + gap;
    art.rect(64, panelY, 952, panelH, p.surface, mode === 'notice' ? 4 : 24);
    art.text(schedule, 112, panelY + 48, 856, scheduleSize, p.foreground, 'schedule', 'center');
  } else if (mode === 'steps') {
    const careCategory = ['fisioterapia', 'nutricao', 'psicologia', 'veterinaria'].includes(category);
    const labels = input.postMode === 'queue'
      ? ['Conheça os serviços', 'Consulte o atendimento', 'Fale com a equipe']
      : careCategory
        ? ['Conte o motivo do contato', 'Consulte os horários', 'Confirme o atendimento']
        : ['Escolha o serviço', 'Consulte a disponibilidade', 'Confirme seu horário'];
    const labelSize = story ? 52 : 46;
    const badge = story ? 76 : 64;
    const rowGap = story ? 26 : 18;
    const labelX = 96 + badge + 34;
    const labelWidth = 984 - labelX;
    const labelHeights = labels.map(label => textH(label, labelWidth, labelSize, 'sans'));
    const rowHeights = labelHeights.map(h => Math.max(badge, h) + (story ? 40 : 28));
    const rowsH = rowHeights.reduce((n, h) => n + h, 0) + 2 * rowGap;
    const size = titleSize(title, 952, available - rowsH - gap, story ? 108 : 80);
    const groupH = textH(title, 952, size) + gap + rowsH;
    let y = heading(start + Math.max(0, (available - groupH) / 2), available - rowsH - gap, { target: size }) + gap;
    labels.forEach((label, i) => {
      const rowHeight = rowHeights[i];
      const numberSize = story ? 42 : 36;
      art.rect(64, y, 952, rowHeight, p.surface, 16);
      art.rect(96, y + (rowHeight - badge) / 2, badge, badge, p.accent, badge / 2);
      art.text(String(i + 1), 96, y + (rowHeight - numberSize * 1.24) / 2, badge, numberSize, p.accentForeground, 'step-number', 'center');
      art.text(label, labelX, y + (rowHeight - labelHeights[i]) / 2, labelWidth, labelSize, p.foreground, 'step-label', 'left', 'sans');
      y += rowHeight + rowGap;
    });
  } else if (mode === 'team') {
    if (hasImage) {
      const photoH = Math.min(available, story ? 760 : 580);
      const photoW = Math.min(430, photoH * .8);
      const photoY = start + (available - photoH) / 2;
      const size = titleSize(title, 466, photoH, story ? 104 : 78);
      const titleH = textH(title, 466, size);
      art.text(title, 64, photoY + (photoH - titleH) / 2, 466, size, p.foreground, 'headline');
      paintPhoto(586 + (430 - photoW) / 2, photoY, photoW, photoH, 'team-photo');
    } else {
      const size = titleSize(title, 952, available - 220 - gap, story ? 118 : 90);
      const groupH = 180 + gap + textH(title, 952, size);
      const y = start + Math.max(0, (available - groupH) / 2);
      art.nodes.push(illustration(category, 450, y, 180, p.accent));
      heading(y + 180 + gap, available - 180 - gap, { target: size, center: true });
    }
  } else if (mode === 'guide' || mode === 'question' || mode === 'quote') {
    const size = titleSize(title, 888, available - 128, story ? 132 : 100);
    const h = textH(title, 888, size);
    const y = start + Math.max(0, (available - h) / 2);
    if (mode === 'guide') art.rect(64, y, 6, h, p.accent);
    else art.line(mode === 'quote' ? 444 : 64, y - 40, mode === 'quote' ? 192 : 120, p.accent);
    art.text(title, mode === 'guide' ? 112 : 64, y, 888, size, p.foreground, 'headline', mode === 'quote' ? 'center' : 'left');
  } else if (mode === 'prepare' && !hasImage) {
    const iconSize = story ? 224 : 192;
    const panelPadding = story ? 60 : 44;
    const iconGap = story ? 44 : 30;
    const reserved = 2 * panelPadding + iconSize + iconGap;
    const size = titleSize(title, 856, available - reserved, story ? 100 : 80);
    const groupHeight = textH(title, 856, size) + reserved;
    const y = start + Math.max(0, (available - groupHeight) / 2);
    art.rect(64, y, 952, groupHeight, p.surface, 20);
    art.nodes.push(illustration(category, (1080 - iconSize) / 2, y + panelPadding, iconSize, p.accent));
    art.text(title, 112, y + panelPadding + iconSize + iconGap, 856, size, p.foreground, 'headline', 'center');
  } else {
    // Covers, preparation and result posts keep photo and copy in separate measured regions.
    const imageGap = mode === 'cover' ? (story ? 76 : 52) : gap;
    const size = titleSize(title, 952, available - (hasImage ? 200 + imageGap : 180 + gap), story ? 110 : 84);
    const titleH = textH(title, 952, size);
    const photoH = Math.max(0, available - titleH - imageGap);
    if (hasImage) {
      if (mode === 'result' || mode === 'cover') {
        paintPhoto(64, start, 952, photoH, 'editorial-photo');
        art.text(title, 64, start + photoH + imageGap, 952, size, p.foreground, 'headline');
      } else {
        art.text(title, 64, start, 952, size, p.foreground, 'headline');
        paintPhoto(64, start + titleH + gap, 952, photoH, 'preparation-photo');
      }
    } else {
      const groupH = titleH + gap + 180;
      const y = start + Math.max(0, (available - groupH) / 2);
      art.text(title, 64, y, 952, size, p.foreground, 'headline');
      art.nodes.push(illustration(category, 836, y + titleH + gap, 180, p.accent));
    }
  }

  art.line(64, m.ctaY, 952, p.border);
  art.text(input.ctaText.trim() || 'Agendar atendimento', 64, m.ctaY + 36, 952, 40, p.foreground, 'cta');
  art.text(`Feito com ${BRAND_NAME} · agendai.app`, 64, m.footerY, 952, 24, p.muted, 'platform', 'left', 'sans');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${m.height}" viewBox="0 0 1080 ${m.height}" data-template-key="${xml(template.key)}" data-template-version="${version}" data-business-category="${xml(category)}" data-collection-variant="${template.layoutVariant ?? ''}" data-post-composition="${mode}">${art.nodes.join('')}</svg>`;
}
