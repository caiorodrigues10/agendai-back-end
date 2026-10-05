export const TEMPLATE_VERSION = 2;

export type PostTemplateGroup = "agenda" | "ofertas" | "resultados" | "equipe" | "depoimentos" | "editorial";
export type PostTemplatePhotoMode = "none" | "optional" | "required";
export type PostStockImageKey =
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

export function listPostTemplates() {
  return POST_TEMPLATES.map(({ key, name, description, requiredMedia, group, photoMode, stockImageKey }) => ({
    key,
    name,
    description,
    requiredMedia,
    group,
    photoMode,
    ...(stockImageKey ? { stockImageKey } : {}),
    formats: ["square", "portrait", "story"],
    previewUrl: `/api/posts/templates/${key}/preview`,
    templateVersion: TEMPLATE_VERSION,
  }));
}
