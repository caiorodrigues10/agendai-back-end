/** Local catalog review only: no API, database, credentials or publishing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buildPostSvg, type PostSvgInput } from '../src/modules/posts/services/postImageService';
import { renderSvgToPngSync } from '../src/modules/posts/services/postSvgRenderer';
import { loadPostStockImage } from '../src/modules/posts/services/postStockImages';
import { listPostTemplates, priceSplitEnabled, TEMPLATE_VERSION } from '../src/modules/posts/services/postTemplates';
import { POST_CATEGORY_COLLECTIONS } from '../src/modules/posts/services/postCategoryCollections';
import { LEGAL_POST_SAMPLES } from '../src/modules/posts/services/legalPostSamples.fixture';

const formats = ['square', 'portrait', 'story'] as const;
type Format = typeof formats[number];
type Template = ReturnType<typeof listPostTemplates>[number];
type Collection = typeof POST_CATEGORY_COLLECTIONS[number];
const heights: Record<Format, number> = { square: 1080, portrait: 1350, story: 1920 };
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const notice = 'Dados e imagens ilustrativos para revisão. Nenhum post foi publicado.';

type Options = {
  output: string;
  categories: string[];
  templates: string[];
  profileImage?: string;
  resume: boolean;
  check: boolean;
};
type RenderRecord = {
  templateKey: string;
  category: string;
  format: Format;
  title: string;
  ctaText: string;
  status: 'rendered' | 'reused' | 'error';
  width?: number;
  height?: number;
  bytes?: number;
  minFontSize?: number;
  svgSha256?: string;
  imageOrigin: string;
  file: string;
  svgFile: string;
  error?: string;
};

function parseOptions(args: string[]): Options {
  const options: Options = {
    output: path.resolve(__dirname, '../../artifacts/posts-all-v1'),
    categories: [], templates: [], resume: false, check: false,
  };
  for (let at = 0; at < args.length; at++) {
    const option = args[at];
    if (option === '--resume') options.resume = true;
    else if (option === '--check') options.check = true;
    else if (['--output', '--category', '--template', '--profile-image'].includes(option)) {
      const value = args[++at];
      if (!value || value.startsWith('--')) throw new Error(`Informe um valor após ${option}.`);
      if (option === '--output') options.output = path.resolve(value);
      else if (option === '--profile-image') options.profileImage = path.resolve(value);
      else if (option === '--category') options.categories.push(...value.split(',').filter(Boolean));
      else options.templates.push(...value.split(',').filter(Boolean));
    } else throw new Error(`Opção desconhecida: ${option}. Uso: preview-post-all.ts [--output diretório] [--category categoria] [--template chave] [--profile-image arquivo] [--resume] [--check]`);
  }
  return options;
}

async function readProfile(file?: string): Promise<string | undefined> {
  if (!file) return undefined;
  const bytes = await fs.readFile(file);
  const metadata = await sharp(bytes).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) throw new Error('A foto de perfil precisa ser PNG, JPEG ou WebP.');
  console.warn('A foto de perfil fornecida será usada somente na amostra de advocacia. Confira a autorização e identifique imagens fictícias na revisão.');
  return `data:image/${metadata.format};base64,${bytes.toString('base64')}`;
}

/** Deliberately graphic placeholders: never presented as actual before/after photos. */
async function sampleMedia(alternate = false): Promise<string> {
  const background = alternate ? '#e5e1d7' : '#193d37';
  const ink = alternate ? '#193d37' : '#f9f4e9';
  // Keep the sample free of baked-in labels: a crop must never cut a QA disclaimer.
  // The gallery caption and manifest identify this as a graphic sample, not a photograph.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="${background}"/><circle cx="830" cy="270" r="260" fill="none" stroke="${ink}" stroke-width="5" opacity=".18"/><path d="M80 1050L470 500L1000 1140" fill="none" stroke="${ink}" stroke-width="8" opacity=".25"/><circle cx="540" cy="675" r="${alternate ? 120 : 165}" fill="none" stroke="${ink}" stroke-width="6" opacity=".45"/><path d="M420 880h240" stroke="${ink}" stroke-width="6" opacity=".35"/></svg>`;
  return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;
}

function collectionOf(template: Template): Collection | undefined {
  return POST_CATEGORY_COLLECTIONS.find(collection => collection.category === template.businessCategory);
}

function sampleCopy(template: Template, collection?: Collection) {
  const variant = template.layoutVariant ?? 0;
  const subject = collection?.subjects[0] ?? 'Serviço de exemplo';
  const isOffer = template.priceMode === 'single' || template.priceMode === 'list' || template.key === 'menu-servicos';
  const isTestimonial = ['depoimento', 'avaliacao-clientes'].includes(template.key);
  return {
    title: isTestimonial ? 'Exemplo de depoimento autorizado' : template.sampleTitle || (isOffer ? 'Condição especial de exemplo' : template.name),
    ctaText: isTestimonial ? 'Use apenas relatos autorizados' : isOffer ? 'Consulte as condições' : 'Converse com a equipe',
    // Amounts only belong to the specific price layouts; no invented fees in health or law collections.
    services: isOffer ? [
      { name: template.key === 'gift-card' ? 'Vale-presente de exemplo' : subject, price: 80 },
      ...(template.key === 'menu-servicos' || template.priceMode === 'list' ? [
        { name: 'Serviço de exemplo B', price: 120 },
        { name: 'Serviço de exemplo C', price: 150 },
      ] : []),
    ] : collection && variant === 1 ? [{ name: subject, price: 0 }]
      : collection && variant === 6 ? collection.subjects.slice(0, 3).map(name => ({ name, price: 0 }))
      : [],
  };
}

async function fixtureFor(template: Template, profile: string | undefined, media: [string, string]): Promise<{ input: Omit<PostSvgInput, 'format'>; origin: string }> {
  const collection = collectionOf(template);
  if (template.businessCategory === 'advocacia') {
    const sample = LEGAL_POST_SAMPLES.find(item => item.templateKey === template.key);
    if (!sample) throw new Error(`Amostra jurídica ausente: ${template.key}.`);
    const portrait = template.key === 'advocacia-perfil';
    const primaryImageUrl = portrait ? profile : loadPostStockImage(template.stockImageKey);
    return {
      input: { shopName: 'Bruno Azevedo Advocacia', title: sample.title, ctaText: sample.ctaText, services: [], todaySchedule: null, postMode: 'appointments', templateKey: template.key, paletteKey: 'brand', primaryImageUrl, designOptions: { legalPost: sample.legalPost } },
      origin: portrait ? profile ? 'profile-file-explicitly-supplied' : 'typographic-profile' : primaryImageUrl ? `local-stock:${template.stockImageKey}` : 'code-native',
    };
  }
  const copy = sampleCopy(template, collection);
  const primaryImageUrl = template.requiredMedia > 0 ? media[0] : template.photoMode === 'none' ? null : loadPostStockImage(template.stockImageKey);
  const shopName = collection ? `${collection.label} · Exemplo` : 'Estabelecimento de exemplo';
  return {
    input: {
      ...copy, shopName, postMode: 'appointments', todaySchedule: !collection || template.layoutVariant === 3 ? { isOpen: true, openTime: '09:00', closeTime: '18:00' } : null,
      templateKey: template.key, paletteKey: 'brand', primaryImageUrl,
      secondaryImageUrl: template.requiredMedia === 2 ? media[1] : null,
      illustrativeBackground: Boolean(primaryImageUrl && template.stockImageKey?.startsWith('promo-')),
    },
    origin: template.requiredMedia > 0 ? 'graphic-sample-placeholder' : primaryImageUrl ? `local-stock:${template.stockImageKey}` : 'code-native',
  };
}

async function renderOne(out: string, template: Template, format: Format, fixture: Awaited<ReturnType<typeof fixtureFor>>, resume: boolean): Promise<RenderRecord> {
  const category = template.businessCategory || 'legados';
  const file = `images/${template.key}-${format}.png`;
  const svgFile = `images/${template.key}-${format}.svg`;
  const result: RenderRecord = { templateKey: template.key, category, format, title: fixture.input.title, ctaText: fixture.input.ctaText, status: 'error', imageOrigin: fixture.origin, file, svgFile };
  try {
    const svg = buildPostSvg({ ...fixture.input, format });
    if (/>(?:undefined|NaN)<|="NaN(?:"|\s)/.test(svg)) throw new Error('SVG contém texto ou coordenada inválida.');
    const svgPath = path.join(out, svgFile);
    const pngPath = path.join(out, file);
    let reused = false;
    let png: Buffer | undefined;
    if (resume) {
      try {
        if (await fs.readFile(svgPath, 'utf8') === svg) {
          png = await fs.readFile(pngPath);
          const dimensions = await sharp(png).metadata();
          reused = dimensions.width === 1080 && dimensions.height === heights[format];
        }
      } catch { /* Missing/obsolete artifacts are rendered afresh. */ }
    }
    if (!reused) {
      png = renderSvgToPngSync(svg);
      await fs.writeFile(svgPath, svg);
      await fs.writeFile(pngPath, png);
    }
    const dimensions = await sharp(png!).metadata();
    if (dimensions.width !== 1080 || dimensions.height !== heights[format]) throw new Error(`Dimensão inválida: ${dimensions.width}×${dimensions.height}.`);
    const fonts = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1]));
    return { ...result, status: reused ? 'reused' : 'rendered', width: dimensions.width, height: dimensions.height, bytes: png!.length, ...(fonts.length ? { minFontSize: Math.min(...fonts) } : {}), svgSha256: createHash('sha256').update(svg).digest('hex') };
  } catch (error) {
    return { ...result, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeProofs(out: string, records: RenderRecord[], templates: Template[]) {
  const successful = records.filter(record => record.status !== 'error');
  const groups = new Map<string, { template: Template; png: Buffer }[]>();
  for (const template of templates) {
    const rows = successful.filter(record => record.templateKey === template.key);
    if (rows.length !== formats.length) continue;
    const layers: sharp.OverlayOptions[] = [];
    for (const [index, format] of formats.entries()) {
      const row = rows.find(record => record.format === format)!;
      layers.push({ input: await sharp(path.join(out, row.file)).resize({ width: 360 }).png().toBuffer(), left: index * 384, top: 44 });
    }
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1128" height="36">${['Quadrado · 360px', 'Retrato · 360px', 'Story · 360px'].map((label, index) => `<text x="${index * 384 + 6}" y="24" font-family="sans-serif" font-size="14" fill="#243e36">${label}</text>`).join('')}</svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 1128, height: 708, channels: 4, background: '#e8e6df' } }).composite(layers).png().toFile(path.join(out, 'audit', `${template.key}-mobile-360.png`));
    const portrait = rows.find(record => record.format === 'portrait')!;
    const group = groups.get(portrait.category) ?? [];
    group.push({ template, png: await sharp(path.join(out, portrait.file)).resize({ width: 360 }).png().toBuffer() });
    groups.set(portrait.category, group);
  }
  for (const [category, cards] of groups) {
    const columns = 5, cellWidth = 384, cellHeight = 494;
    const layers: sharp.OverlayOptions[] = [];
    cards.forEach(({ template, png }, index) => {
      const x = (index % columns) * cellWidth;
      const y = Math.floor(index / columns) * cellHeight;
      layers.push({ input: png, left: x, top: y });
      // The key remains searchable and avoids clipping long category labels.
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="32"><text x="2" y="22" font-family="sans-serif" font-size="13" fill="#243e36">${xml(template.key)}</text></svg>`), left: x, top: y + 454 });
    });
    await sharp({ create: { width: columns * cellWidth - 24, height: Math.ceil(cards.length / columns) * cellHeight - 8, channels: 4, background: '#e8e6df' } }).composite(layers).png().toFile(path.join(out, 'boards', `categoria-${category}-portrait-360.png`));
  }
}

function galleryHtml(templates: Template[], records: RenderRecord[], coverage: ReturnType<typeof coverageFor>, partial: boolean) {
  const options = coverage.map(row => `<option value="${xml(row.category)}">${xml(row.label)}</option>`).join('');
  const proofKeys = new Set(templates.filter(template => records.filter(row => row.templateKey === template.key && row.status !== 'error').length === formats.length).map(template => template.key));
  const cards = records.map(row => {
    const template = templates.find(item => item.key === row.templateKey)!;
    const failed = row.status === 'error';
    return `<figure data-category="${xml(row.category)}" data-format="${row.format}" data-search="${xml(`${row.templateKey} ${template.name}`.toLowerCase())}">${failed ? `<div class="error">Falha na geração: ${xml(row.error ?? '')}</div>` : `<a href="${row.file}" target="_blank" rel="noopener"><img loading="lazy" src="${row.file}" width="1080" height="${row.height}" alt="${xml(template.name)} · ${row.format}"></a>`}<figcaption><strong>${xml(template.name)}</strong><span>${row.format}</span></figcaption><p class="description">${xml(template.description)}</p><small>${xml(row.templateKey)} · ${xml(row.imageOrigin)}</small>${!failed ? `<p class="links"><a href="${row.svgFile}">SVG</a>${proofKeys.has(row.templateKey) ? ` · <a href="audit/${row.templateKey}-mobile-360.png">Comparar formatos</a>` : ''}</p>` : ''}</figure>`;
  }).join('');
  const rows = coverage.map(row => `<tr><td>${xml(row.segment)}</td><td>${xml(row.label)}</td><td>${row.catalogTemplates}</td><td>${row.selectedTemplates}</td><td>${row.successfulRenders}/${row.expectedRenders}</td><td>${row.failedRenders ? 'Há falhas' : row.complete ? 'Completo' : 'Parcial'}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Posts · catálogo completo</title><style>
*{box-sizing:border-box}body{margin:0;padding:32px 24px;background:#e8e6df;color:#243e36;font:16px system-ui}header,main,section{max-width:1400px;margin:0 auto}h1{font:clamp(32px,5vw,56px) Georgia;margin:12px 0}p{line-height:1.6}header>p{max-width:850px}.filters{display:flex;gap:16px;align-items:end;flex-wrap:wrap;margin:24px 0}label{display:grid;gap:6px;font-size:14px}select,input{min-height:44px;padding:10px 12px;border:1px solid #9ca99c;border-radius:6px;color:inherit;background:#f7f4ed;font:inherit}input{min-width:240px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:36px 28px}figure{margin:0}figure[hidden]{display:none}img{display:block;width:100%;height:auto;background:#f7f4ed}figcaption{display:flex;gap:12px;justify-content:space-between;margin-top:12px}figcaption span,small{font-size:12px;color:#52665d}.description{font-size:14px;margin:6px 0}.links{font-size:14px;margin:8px 0}a{color:inherit}a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #9c653b;outline-offset:4px}.error{padding:24px;background:#fae3dd;min-height:180px;color:#802d20}details{margin:24px 0 36px}summary{cursor:pointer;padding:10px 0}table{border-collapse:collapse;font-size:14px;width:100%}td,th{padding:10px;border-bottom:1px solid #bcc4b9;text-align:left}.table-wrap{overflow:auto}#count{margin:0 0 24px}#empty{padding:24px;background:#f7f4ed}@media(max-width:900px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){body{padding:24px 16px}main{grid-template-columns:1fr}.filters>*{width:100%}}
</style></head><body><header><small>REVISÃO LOCAL · TEMPLATE V${TEMPLATE_VERSION}</small><h1>Posts para cada categoria.</h1><p>${notice} ${partial ? 'Esta execução é parcial: os filtros de linha de comando limitaram a geração.' : 'Cobertura das categorias do sistema e dos modelos legados.'} Preços, depoimentos e horários são exemplos. Imagens de amostra não comprovam resultados.</p><p><a href="manifest.json">Manifesto e métricas</a> · <a href="coverage.json">Cobertura por segmento</a> · <a href="catalog.json">Catálogo</a></p><details><summary>Conferir cobertura dos ${coverage.length} segmentos</summary><div class="table-wrap"><table><thead><tr><th>Segmento</th><th>Categoria</th><th>Catálogo</th><th>Selecionados</th><th>Artes</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div></details><div class="filters"><label>Categoria<select id="category"><option value="all">Todas as categorias</option>${options}<option value="legados">Modelos legados</option></select></label><label>Formato<select id="format"><option value="portrait">Retrato · 4:5</option><option value="square">Quadrado · 1:1</option><option value="story">Story · 9:16</option><option value="all">Todos os formatos</option></select></label><label>Buscar modelo<input id="search" type="search" placeholder="Nome ou chave do modelo"></label></div><p id="count" role="status" aria-live="polite"></p><p id="empty" hidden>Nenhum modelo corresponde aos filtros.</p></header><main>${cards}</main><script>
const category=document.getElementById('category'),format=document.getElementById('format'),search=document.getElementById('search');function show(){let count=0;const term=search.value.trim().toLocaleLowerCase('pt-BR');document.querySelectorAll('figure').forEach(card=>{const visible=(category.value==='all'||card.dataset.category===category.value)&&(format.value==='all'||card.dataset.format===format.value)&&(!term||card.dataset.search.includes(term));card.hidden=!visible;if(visible)count++});document.getElementById('count').textContent=count+' artes correspondentes aos filtros';document.getElementById('empty').hidden=count>0}category.addEventListener('change',show);format.addEventListener('change',show);search.addEventListener('input',show);show();
</script></body></html>`;
}

function coverageFor(catalog: Template[], selected: Template[], records: RenderRecord[]) {
  return POST_CATEGORY_COLLECTIONS.map(collection => {
    const catalogTemplates = catalog.filter(template => template.businessCategory === collection.category).length;
    const selectedTemplates = selected.filter(template => template.businessCategory === collection.category).length;
    const rows = records.filter(row => row.category === collection.category);
    const successfulRenders = rows.filter(row => row.status !== 'error').length;
    return { segment: collection.segment, category: collection.category, label: collection.label, minimumRequiredTemplates: 10, catalogTemplates, selectedTemplates, expectedRenders: Math.max(10, catalogTemplates) * formats.length, selectedExpectedRenders: selectedTemplates * formats.length, successfulRenders, failedRenders: rows.filter(row => row.status === 'error').length, complete: catalogTemplates >= 10 && selectedTemplates === catalogTemplates && successfulRenders === catalogTemplates * formats.length };
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const fullCatalog = listPostTemplates(true);
  const separateEngine = fullCatalog.filter(template => template.key === 'price-split');
  const catalog = fullCatalog.filter(template => template.key !== 'price-split');
  if (new Set(catalog.map(template => template.key)).size !== catalog.length) throw new Error('Catálogo contém chaves duplicadas.');
  if (catalog.some(template => !/^[a-z0-9-]+$/.test(template.key))) throw new Error('Chave de template inválida para um arquivo local.');
  const categoryKeys = new Set<string>([...POST_CATEGORY_COLLECTIONS.map(collection => collection.category), 'legados']);
  for (const category of options.categories) if (!categoryKeys.has(category)) throw new Error(`Categoria desconhecida: ${category}.`);
  for (const key of options.templates) if (!catalog.some(template => template.key === key)) throw new Error(`Modelo desconhecido ou de motor separado: ${key}.`);
  const selected = catalog.filter(template => (!options.categories.length || options.categories.includes(template.businessCategory || 'legados')) && (!options.templates.length || options.templates.includes(template.key)));
  if (!selected.length) throw new Error('Nenhum modelo selecionado para revisão.');
  const partial = selected.length !== catalog.length;
  if (options.check) {
    console.log(JSON.stringify({ output: options.output, segments: POST_CATEGORY_COLLECTIONS.length, catalogTemplates: catalog.length, selectedTemplates: selected.length, expectedRenders: selected.length * formats.length, partial, separateEngine: separateEngine.map(template => ({ key: template.key, enabled: priceSplitEnabled(), reason: 'Rendered by the separate price-split spec engine, outside buildPostSvg.' })), coverage: coverageFor(catalog, selected, []) }, null, 2));
    return;
  }
  await fs.mkdir(path.join(options.output, 'images'), { recursive: true });
  await fs.mkdir(path.join(options.output, 'audit'), { recursive: true });
  await fs.mkdir(path.join(options.output, 'boards'), { recursive: true });
  const profile = await readProfile(options.profileImage);
  const media: [string, string] = [await sampleMedia(), await sampleMedia(true)];
  const records: RenderRecord[] = [];
  const startedAt = new Date().toISOString();
  for (const [index, template] of selected.entries()) {
    const fixture = await fixtureFor(template, profile, media);
    for (const format of formats) {
      const record = await renderOne(options.output, template, format, fixture, options.resume);
      records.push(record);
      if (record.status === 'error') console.error(`${template.key}/${format}: ${record.error}`);
    }
    console.log(`${index + 1}/${selected.length} · ${template.key}`);
  }
  await writeProofs(options.output, records, selected);
  const coverage = coverageFor(catalog, selected, records);
  const manifest = { notice, startedAt, finishedAt: new Date().toISOString(), templateVersion: TEMPLATE_VERSION, segments: POST_CATEGORY_COLLECTIONS.length, totalCatalogTemplates: catalog.length, selectedTemplates: selected.length, expectedRenders: selected.length * formats.length, successfulRenders: records.filter(row => row.status !== 'error').length, failedRenders: records.filter(row => row.status === 'error').length, coverageComplete: coverage.every(row => row.complete), partial, profileImageSupplied: Boolean(profile), separateEngine: separateEngine.map(template => ({ key: template.key, enabled: priceSplitEnabled(), reason: 'Motor de camadas próprio; não é renderizado por buildPostSvg.' })), coverage, records };
  await fs.writeFile(path.join(options.output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(options.output, 'coverage.json'), JSON.stringify(coverage, null, 2));
  await fs.writeFile(path.join(options.output, 'catalog.json'), JSON.stringify(fullCatalog, null, 2));
  await fs.writeFile(path.join(options.output, 'index.html'), galleryHtml(selected, records, coverage, partial));
  console.log(`${manifest.successfulRenders}/${manifest.expectedRenders} artes válidas em ${options.output}`);
  if (manifest.failedRenders || (!partial && !manifest.coverageComplete)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
