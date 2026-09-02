export const POST_TEMPLATES = [
  ["agenda-aberta", "Agenda aberta", "Mostre horários disponíveis hoje.", 0],
  ["ultimas-vagas", "Últimas vagas", "Crie urgência sem poluir a arte.", 1],
  ["promocao-relampago", "Promoção relâmpago", "Oferta com destaque visual.", 1],
  ["servico-destaque", "Serviço em destaque", "Apresente um serviço e seu preço.", 1],
  ["antes-depois", "Antes e depois", "Compare dois resultados lado a lado.", 2],
  ["transformacao", "Transformação", "Valorize o resultado final.", 1],
  ["profissional-destaque", "Profissional em destaque", "Apresente quem atende.", 1],
  ["depoimento", "Depoimento", "Destaque a experiência de uma cliente.", 1],
  ["menu-servicos", "Menu de serviços", "Liste seus serviços principais.", 0],
  ["horario-especial", "Horário especial", "Avise sobre feriados e horários.", 0],
  ["novidade", "Novidade", "Anuncie uma novidade do salão.", 1],
  ["editorial-minimalista", "Editorial minimalista", "Uma composição limpa e elegante.", 1],
] as const;

export function listPostTemplates() {
  return POST_TEMPLATES.map(([key, name, description, requiredMedia]) => ({
    key,
    name,
    description,
    requiredMedia,
    formats: ["square", "portrait", "story"],
    previewUrl: `/api/posts/templates/${key}/preview`,
  }));
}
