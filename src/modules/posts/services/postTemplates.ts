export const TEMPLATE_VERSION = 1;

type TemplateGroup = 'agenda' | 'ofertas' | 'resultados' | 'equipe' | 'depoimentos';

export const POST_TEMPLATES = [
  ["agenda-aberta", "Agenda aberta", "Mostre horários disponíveis hoje.", 0, "agenda" as TemplateGroup],
  ["ultimas-vagas", "Últimas vagas", "Crie urgência sem poluir a arte.", 1, "agenda" as TemplateGroup],
  ["promocao-relampago", "Promoção relâmpago", "Oferta com destaque visual.", 1, "ofertas" as TemplateGroup],
  ["servico-destaque", "Serviço em destaque", "Apresente um serviço e seu preço.", 1, "ofertas" as TemplateGroup],
  ["antes-depois", "Antes e depois", "Compare dois resultados lado a lado.", 2, "resultados" as TemplateGroup],
  ["transformacao", "Transformação", "Valorize o resultado final.", 1, "resultados" as TemplateGroup],
  ["profissional-destaque", "Profissional em destaque", "Apresente quem atende.", 1, "equipe" as TemplateGroup],
  ["depoimento", "Depoimento", "Destaque a experiência de uma cliente.", 1, "depoimentos" as TemplateGroup],
  ["menu-servicos", "Menu de serviços", "Liste seus serviços principais.", 0, "ofertas" as TemplateGroup],
  ["horario-especial", "Horário especial", "Avise sobre feriados e horários.", 0, "agenda" as TemplateGroup],
  ["novidade", "Novidade", "Anuncie uma novidade do salão.", 1, "ofertas" as TemplateGroup],
  ["editorial-minimalista", "Editorial minimalista", "Uma composição limpa e elegante.", 1, "resultados" as TemplateGroup],
] as const;

export function listPostTemplates() {
  return POST_TEMPLATES.map(([key, name, description, requiredMedia, group]) => ({
    key,
    name,
    description,
    requiredMedia,
    group,
    formats: ["square", "portrait", "story"],
    previewUrl: `/api/posts/templates/${key}/preview`,
    templateVersion: TEMPLATE_VERSION,
  }));
}
