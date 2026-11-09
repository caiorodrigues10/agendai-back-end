import { POST_CATEGORY_COLLECTIONS, type PostCategory } from './postCategoryCollections';
import { LEGAL_POST_TEMPLATES } from './legalPostTemplates';
import { postAudience, type PostBusinessContext } from './postAudience';
import { PRICE_SPLIT_MANIFEST } from '../templates/price-split/manifest';

import { TEMPLATE_VERSION } from './postTemplateVersion';
export { TEMPLATE_VERSION } from './postTemplateVersion';

/**
 * Rollout do modelo "Tabela de valores · Foto + painel" (price-split).
 * Flag lida em runtime (mesmo padrão de POST_IMAGE_ALLOW_LOOPBACK): sem `1`
 * o catálogo volta ao v2 legado e o modelo nem aparece no editor.
 */
export function priceSplitEnabled(): boolean {
  return process.env.POST_PRICE_SPLIT === "1";
}

export type PostTemplateGroup = "agenda" | "ofertas" | "resultados" | "equipe" | "depoimentos" | "editorial" | "advocacia";
export type PostTemplatePhotoMode = "none" | "optional" | "required";
export type PostStockImageKey =
  | "law-columns"
  | "law-desk"
  | "law-office"
  | "salon"
  | "barber"
  | "beauty"
  | "promo-offer"
  | "promo-service"
  | "promo-beauty"
  | "promo-agenda"
  | "promo-menu"
  | "promo-notice"
  | "promo-editorial"
  | "promo-flash"
  | "promo-combo"
  | "promo-slots"
  | "promo-beauty-luxe"
  | "promo-gift"
  | "promo-loyalty"
  | "promo-review"
  | "promo-launch";

export interface PostTemplate {
  key: string;
  name: string;
  description: string;
  /** Quantidade de fotos OBRIGATÓRIAS do cliente (0 = nenhuma). */
  requiredMedia: 0 | 1 | 2;
  group: PostTemplateGroup;
  /** Uso de foto pelo layout: none | optional | required. */
  photoMode: PostTemplatePhotoMode;
  /** Imagem ilustrativa de fallback (assets locais) quando photoMode permite foto e não há upload. */
  stockImageKey?: PostStockImageKey;
  businessCategory?: PostCategory;
  layoutVariant?: number;
  sampleTitle?: string;
}

/**
 * Catálogo v2.
 *
 * - Chaves legadas preservadas (`agenda-aberta` … `editorial-minimalista`).
 * - Foto obrigatória somente em: `antes-depois` (2), `transformacao` (1),
 *   `profissional-destaque` (1) e `editorial-minimalista` (1).
 * - Modelos `photoMode: "optional"` aceitam foto (upload ou stock ilustrativo)
 *   e resolvem com tipografia forte quando não há imagem.
 */
export const POST_TEMPLATES: PostTemplate[] = [
  // — Legados —
  { key: "agenda-aberta", name: "Agenda aberta", description: "Mostre horários disponíveis hoje.", requiredMedia: 0, group: "agenda", photoMode: "optional", stockImageKey: "promo-agenda" },
  { key: "ultimas-vagas", name: "Últimas vagas", description: "Crie urgência sem poluir a arte.", requiredMedia: 0, group: "agenda", photoMode: "optional", stockImageKey: "promo-offer" },
  { key: "promocao-relampago", name: "Promoção relâmpago", description: "Oferta com destaque visual.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-offer" },
  { key: "servico-destaque", name: "Serviço em destaque", description: "Apresente um serviço e seu preço.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-service" },
  { key: "antes-depois", name: "Antes e depois", description: "Compare dois resultados lado a lado.", requiredMedia: 2, group: "resultados", photoMode: "required" },
  { key: "transformacao", name: "Transformação", description: "Valorize o resultado final.", requiredMedia: 1, group: "resultados", photoMode: "required" },
  { key: "profissional-destaque", name: "Profissional em destaque", description: "Apresente quem atende.", requiredMedia: 1, group: "equipe", photoMode: "required" },
  { key: "depoimento", name: "Depoimento", description: "Destaque a experiência de uma cliente.", requiredMedia: 0, group: "depoimentos", photoMode: "none" },
  { key: "menu-servicos", name: "Menu de serviços", description: "Liste seus serviços principais.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-menu" },
  { key: "horario-especial", name: "Horário especial", description: "Avise sobre feriados e horários.", requiredMedia: 0, group: "agenda", photoMode: "optional", stockImageKey: "promo-notice" },
  { key: "novidade", name: "Novidade", description: "Anuncie uma novidade do salão.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-beauty" },
  { key: "editorial-minimalista", name: "Editorial minimalista", description: "Composição limpa com foto em destaque.", requiredMedia: 1, group: "resultados", photoMode: "required" },
  // — Novos modelos editoriais (v2) —
  { key: "editorial-foto", name: "Editorial com foto", description: "Foto ampla em moldura editorial com tipografia enxuta.", requiredMedia: 0, group: "editorial", photoMode: "optional", stockImageKey: "salon" },
  { key: "capa-impacto", name: "Capa de impacto", description: "Foto em tela cheia com título gigante estilo capa.", requiredMedia: 0, group: "editorial", photoMode: "optional", stockImageKey: "barber" },
  { key: "revista-beleza", name: "Revista de beleza", description: "Composição de revista: foto, manchete e detalhes finos.", requiredMedia: 0, group: "editorial", photoMode: "optional", stockImageKey: "beauty" },
  { key: "tipografico", name: "Tipográfico", description: "Só tipografia: título grande, linhas finas e ritmo.", requiredMedia: 0, group: "editorial", photoMode: "optional", stockImageKey: "promo-editorial" },
  { key: "oferta-clean", name: "Oferta clean", description: "Oferta minimalista com preço em evidência.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-offer" },
  { key: "recado-studio", name: "Recado do studio", description: "Aviso direto e elegante do seu espaço.", requiredMedia: 0, group: "agenda", photoMode: "optional", stockImageKey: "promo-notice" },
  { key: "promocao-cobre", name: "Promoção cobre", description: "Arte escura com brilho quente para ofertas fortes.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-flash" },
  { key: "combo-premium", name: "Combo premium", description: "Divulgue pacotes como corte, barba e sobrancelha.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-combo" },
  { key: "agenda-premium", name: "Agenda premium", description: "Vagas disponíveis com visual mais sofisticado.", requiredMedia: 0, group: "agenda", photoMode: "optional", stockImageKey: "promo-slots" },
  { key: "beleza-luxo", name: "Beleza luxo", description: "Serviços de beleza com estética clara e premium.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-beauty-luxe" },
  { key: "gift-card", name: "Gift card", description: "Venda vale-presente e vouchers do salão.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-gift" },
  { key: "fidelidade", name: "Fidelidade", description: "Incentive retorno com pontos, bônus ou recompensas.", requiredMedia: 0, group: "depoimentos", photoMode: "optional", stockImageKey: "promo-loyalty" },
  { key: "avaliacao-clientes", name: "Avaliação de clientes", description: "Mostre reputação, depoimentos e prova social.", requiredMedia: 0, group: "depoimentos", photoMode: "optional", stockImageKey: "promo-review" },
  { key: "lancamento-premium", name: "Lançamento premium", description: "Anuncie inauguração, novidade ou serviço novo.", requiredMedia: 0, group: "ofertas", photoMode: "optional", stockImageKey: "promo-launch" },
];

// Ten useful compositions for every registered segment; legacy keys stay stable.
const compositions = ['Apresentação', 'Serviço em foco', 'Como funciona', 'Atendimento e horários', 'Orientação', 'Prepare sua visita', 'Serviços do espaço', 'Dúvidas e contato', 'Equipe e bastidores', 'Aviso'];
const descriptions = [
  'Fotografia e mensagem em regiões separadas, com respiro.',
  'Um serviço com nome completo em destaque.',
  'Etapas do contato e confirmação de atendimento.',
  'Horários informados pelo estabelecimento, sem inventar vagas.',
  'Uma orientação curta com tipografia ampla.',
  'Mensagem de preparação, com imagem própria opcional.',
  'Lista legível dos serviços selecionados.',
  'Mensagem para iniciar uma conversa com a equipe.',
  'Foto própria ou identificação ilustrativa, sem retrato automático.',
  'Comunicado centralizado com informação operacional.',
];
for (const collection of POST_CATEGORY_COLLECTIONS) {
  if (collection.category === 'advocacia') continue;
  compositions.forEach((composition, index) => POST_TEMPLATES.push({
    key: `${collection.category}-colecao-${index + 1}`,
    name: `${collection.label} · ${composition}`,
    description: `${descriptions[index]} Personalize com os dados de ${collection.label.toLocaleLowerCase('pt-BR')}.`,
    requiredMedia: 0, photoMode: [2, 3, 4, 6, 7, 9].includes(index) ? 'none' : 'optional', group: index === 3 || index === 9 ? 'agenda' : 'editorial',
    ...(collection.stock && ![2, 3, 4, 6, 7, 8, 9].includes(index) ? { stockImageKey: collection.stock } : {}),
    businessCategory: collection.category, layoutVariant: index, sampleTitle: collection.titles[index],
  }));
}

// The editor only offers media controls for compositions that actually draw it.
const textOnlyKeys = new Set(['agenda-aberta', 'ultimas-vagas', 'agenda-premium', 'depoimento', 'avaliacao-clientes', 'menu-servicos', 'horario-especial', 'recado-studio', 'tipografico', 'fidelidade']);
for (const template of POST_TEMPLATES) if (textOnlyKeys.has(template.key)) {
  template.photoMode = 'none';
  delete template.stockImageKey;
}

LEGAL_POST_TEMPLATES.forEach(([key, name, sampleTitle, description], layoutVariant) => POST_TEMPLATES.push({
  key, name, sampleTitle, description, layoutVariant,
  group: 'advocacia', businessCategory: 'advocacia', requiredMedia: 0,
  photoMode: [0, 8].includes(layoutVariant) ? 'optional' : 'none',
  ...(layoutVariant === 0 ? { stockImageKey: 'law-office' as const } : {}),
}));

const formerlyBeautySegments = new Set(['NAIL_STUDIO', 'LASH_BROW_STUDIO', 'AESTHETICS', 'SPA', 'MAKEUP_STUDIO']);

export function availablePostTemplates(context: PostBusinessContext, includeDisabled = false, includeLegacy = false) {
  const category = postAudience(context).category;
  const showLegacy = includeLegacy || includeDisabled || !context.businessSegment || ['barbearia', 'salao', 'beleza'].includes(category);
  const catalog = listPostTemplates(includeDisabled);
  const active = catalog.filter(template => category === 'advocacia'
    ? template.businessCategory === 'advocacia'
    : template.businessCategory === category || !template.businessCategory && (showLegacy || template.key === 'price-split'));
  // The new collections split these segments out of the former beauty category.
  // Keep their saved templates editable without advertising them in the new-post catalog.
  if ((includeLegacy || includeDisabled) && formerlyBeautySegments.has(context.businessSegment ?? '')) {
    return [...active, ...catalog.filter(template => template.businessCategory === 'beleza')];
  }
  return active;
}

const OFFER_TEMPLATES = new Set(['promocao-relampago', 'servico-destaque', 'oferta-clean', 'promocao-cobre', 'combo-premium', 'beleza-luxo', 'gift-card']);
export function listPostTemplates(includeDisabled = false) {
  const list = POST_TEMPLATES.map(({ key, name, description, requiredMedia, group, photoMode, stockImageKey, businessCategory, layoutVariant, sampleTitle }) => ({
    key,
    name,
    description,
    requiredMedia,
    group,
    photoMode,
    ...(OFFER_TEMPLATES.has(key) ? { priceMode: 'single' as 'single' | 'list' } : {}),
    ...(businessCategory ? { businessCategory } : {}),
    ...(layoutVariant !== undefined ? { layoutVariant } : {}),
    ...(sampleTitle ? { sampleTitle } : {}),
    ...(stockImageKey ? { stockImageKey } : {}),
    formats: ["square", "portrait", "story"],
    previewUrl: `/api/posts/templates/${key}/preview`,
    templateVersion: TEMPLATE_VERSION,
  }));
  if (priceSplitEnabled() || includeDisabled) list.push(priceSplitTemplate());
  return list;
}

/** Entrada do catálogo v2 derivada do manifesto (fonte única dos campos). */
function priceSplitTemplate() {
  const key = PRICE_SPLIT_MANIFEST.key;
  return {
    key,
    name: PRICE_SPLIT_MANIFEST.name,
    description: PRICE_SPLIT_MANIFEST.description,
    /** Lista de preços dispensa foto obrigatória (stock do segmento na falta). */
    requiredMedia: 0 as const,
    group: "ofertas" as const,
    photoMode: PRICE_SPLIT_MANIFEST.photoMode,
    priceMode: "list" as "single" | "list",
    formats: ["square", "portrait", "story"],
    previewUrl: `/api/posts/templates/${key}/preview`,
    templateVersion: TEMPLATE_VERSION,
  };
}
