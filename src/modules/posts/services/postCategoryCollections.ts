import type { BusinessSegment } from '@prisma/client';

export type PostCategory = 'barbearia' | 'salao' | 'unhas' | 'petshop' | 'beleza'
  | 'cilios-sobrancelhas' | 'estetica' | 'spa' | 'maquiagem' | 'fisioterapia'
  | 'nutricao' | 'psicologia' | 'veterinaria' | 'lava-jato' | 'oficina'
  | 'fotografia' | 'tatuagem-piercing' | 'consultoria' | 'aulas'
  | 'assistencia-tecnica' | 'servicos-domiciliares' | 'advocacia' | 'outros';

export interface PostCategoryCollection {
  segment: BusinessSegment;
  category: PostCategory;
  label: string;
  stock?: 'barber' | 'salon' | 'beauty';
  /** Presentation, focus, process, agenda, care, preparation, services, FAQ, team, notice. */
  titles: readonly string[];
  /** Illustrative services for local galleries only; never evidence of a tenant's actual services. */
  subjects: readonly string[];
}

/**
 * One collection per registered segment. Titles describe the purpose of a post;
 * they do not assert availability, credentials, prices, results or client stories.
 * Law retains its dedicated editorial models and professional-identification rules.
 */
export const POST_CATEGORY_COLLECTIONS: readonly PostCategoryCollection[] = [
  {
    segment: 'BARBERSHOP', category: 'barbearia', label: 'Barbearia', stock: 'barber',
    titles: [
      'Conheça a barbearia', 'Converse sobre o corte que você procura', 'Conte sua ideia antes de começar o corte',
      'Confirme seu horário antes de vir', 'Pergunte como cuidar da barba em casa', 'Traga referências para o seu corte',
      'Consulte os serviços da barbearia', 'Primeiro corte aqui? Tire suas dúvidas',
      'Conheça quem vai cuidar do seu corte', 'Precisa remarcar? Avise a barbearia',
    ],
    subjects: ['Corte de cabelo', 'Barba', 'Corte e barba', 'Corte na tesoura', 'Acabamento', 'Design de sobrancelhas'],
  },
  {
    segment: 'HAIR_SALON', category: 'salao', label: 'Salão', stock: 'salon',
    titles: [
      'Conheça o salão', 'Converse sobre o corte que deseja', 'Alinhe o visual antes de começar',
      'Confirme a duração ao marcar seu horário', 'Pergunte como cuidar do cabelo em casa',
      'Traga referências do visual que procura', 'Consulte os serviços para o seu cabelo',
      'Vai mudar o visual? Fale com a equipe', 'Conheça quem cuida do seu cabelo', 'Precisa remarcar? Fale com o salão',
    ],
    subjects: ['Corte de cabelo', 'Escova', 'Hidratação capilar', 'Coloração', 'Penteado', 'Finalização'],
  },
  {
    segment: 'NAIL_STUDIO', category: 'unhas', label: 'Unhas',
    titles: [
      'Conheça o studio de unhas', 'Escolha a esmaltação com a profissional', 'Combine formato e cor antes de começar',
      'Confirme o tempo do seu atendimento', 'Pergunte sobre os cuidados de manutenção',
      'Traga referências para suas unhas', 'Consulte as opções de esmaltação',
      'Primeiro alongamento? Tire suas dúvidas', 'Conheça quem atende no studio de unhas', 'Vai remarcar? Avise o studio',
    ],
    subjects: ['Manicure', 'Pedicure', 'Esmaltação em gel', 'Alongamento em gel', 'Nail art', 'Remoção'],
  },
  {
    segment: 'PETSHOP', category: 'petshop', label: 'Petshop',
    titles: [
      'Conheça o petshop', 'Combine o banho e a tosa do seu pet', 'Conte à equipe sobre a rotina do seu pet',
      'Combine entrada e retirada do seu pet', 'Pergunte sobre os cuidados com a pelagem',
      'Conte como seu pet prefere ser recebido', 'Consulte os serviços para seu pet',
      'Primeira visita? Converse com a equipe', 'Conheça quem vai receber o seu pet', 'Mudou o horário? Avise o petshop',
    ],
    subjects: ['Banho', 'Tosa higiênica', 'Tosa completa', 'Banho e tosa', 'Hidratação de pelagem', 'Corte de unhas'],
  },
  {
    segment: 'BEAUTY_STUDIO', category: 'beleza', label: 'Beleza', stock: 'beauty',
    titles: [
      'Conheça o studio de beleza', 'Converse sobre o cuidado que procura', 'Alinhe preferências antes de iniciar',
      'Confirme seu horário no studio', 'Peça orientações para sua rotina em casa',
      'Traga suas perguntas para o atendimento', 'Consulte os serviços do studio',
      'Não sabe qual cuidado escolher? Pergunte', 'Conheça quem atende no nosso espaço', 'Precisa remarcar? Fale com o studio',
    ],
    subjects: ['Limpeza de pele', 'Design de sobrancelhas', 'Hidratação facial', 'Depilação', 'Maquiagem social'],
  },
  {
    segment: 'LASH_BROW_STUDIO', category: 'cilios-sobrancelhas', label: 'Cílios e sobrancelhas',
    titles: [
      'Conheça o espaço do olhar', 'Converse sobre o design que você procura', 'Combine o desenho antes da finalização',
      'Confirme a data da sua manutenção', 'Peça orientações à profissional',
      'Informe se já usa extensão de cílios', 'Confira os serviços do studio do olhar',
      'Primeira extensão? Tire suas dúvidas', 'Conheça quem atende no studio', 'Mudou de horário? Avise a equipe',
    ],
    subjects: ['Design de sobrancelhas', 'Extensão de cílios', 'Manutenção de cílios', 'Lash lifting', 'Brow lamination', 'Remoção de cílios'],
  },
  {
    segment: 'AESTHETICS', category: 'estetica', label: 'Estética',
    titles: [
      'Conheça o espaço de estética', 'Converse sobre sua avaliação estética', 'Alinhe suas dúvidas antes de decidir',
      'Confirme a duração do atendimento', 'Peça orientações para cuidar da pele',
      'Conte quais cuidados você já faz', 'Consulte os atendimentos de estética',
      'Não sabe por onde começar? Pergunte', 'Conheça a equipe do espaço de estética', 'Precisa remarcar? Entre em contato',
    ],
    subjects: ['Avaliação estética', 'Limpeza de pele', 'Hidratação facial', 'Massagem estética'],
  },
  {
    segment: 'SPA', category: 'spa', label: 'Spa e massagem',
    titles: [
      'Conheça o spa e seus ambientes', 'Converse sobre a massagem que procura', 'Combine suas preferências com a equipe',
      'Confirme seu horário antes da visita', 'Comunique seus limites durante a sessão',
      'Pergunte como preparar sua visita', 'Consulte as experiências do spa',
      'Primeira visita ao spa? Converse', 'Conheça quem recebe você no spa', 'Mudou de plano? Avise o spa',
    ],
    subjects: ['Massagem relaxante', 'Massagem com pedras quentes', 'Reflexologia', 'Escalda-pés'],
  },
  {
    segment: 'MAKEUP_STUDIO', category: 'maquiagem', label: 'Maquiagem e penteado',
    titles: [
      'Conheça o studio de maquiagem', 'Converse sobre a maquiagem do seu evento', 'Combine o visual antes da produção',
      'Informe a hora do evento ao agendar', 'Peça orientações para preparar a pele',
      'Traga referências e detalhes do evento', 'Maquiagem e penteado: consulte as opções',
      'Vai fazer um teste? Combine os detalhes', 'Conheça quem assina a sua produção', 'Precisa remarcar? Avise o studio',
    ],
    subjects: ['Maquiagem social', 'Maquiagem para eventos', 'Penteado', 'Produção para noivas', 'Teste de maquiagem'],
  },
  {
    segment: 'PHYSIOTHERAPY', category: 'fisioterapia', label: 'Fisioterapia',
    titles: [
      'Fisioterapia: conheça o espaço', 'Converse sobre a avaliação inicial', 'Pergunte sobre o primeiro atendimento',
      'Confirme seu horário de fisioterapia', 'Anote suas dúvidas para a sessão',
      'Confirme quais registros levar à sessão', 'Consulte os atendimentos de fisioterapia',
      'Primeira sessão? Tire suas dúvidas', 'Conheça quem acompanha você', 'Não poderá vir? Avise o consultório',
    ],
    subjects: ['Avaliação inicial', 'Sessão de fisioterapia', 'Sessão de acompanhamento'],
  },
  {
    segment: 'NUTRITION', category: 'nutricao', label: 'Nutrição',
    titles: [
      'Nutrição: conheça o consultório', 'Converse sobre a consulta de nutrição', 'Pergunte como funciona o acompanhamento',
      'Confirme seu horário de consulta', 'Leve suas dúvidas sobre alimentação',
      'Anote pontos da rotina para a conversa', 'Consulte os formatos de acompanhamento',
      'Primeira consulta? Pergunte o que levar', 'Conheça quem vai atender você', 'Precisa remarcar? Avise o consultório',
    ],
    subjects: ['Consulta de nutrição', 'Consulta de retorno', 'Acompanhamento nutricional'],
  },
  {
    segment: 'PSYCHOTHERAPY', category: 'psicologia', label: 'Psicologia e terapia',
    titles: [
      'Conheça o espaço de atendimento', 'Converse sobre o primeiro encontro', 'Pergunte como funciona o atendimento',
      'Consulte os horários de atendimento', 'Traga suas dúvidas para a conversa',
      'Confirme o acesso ao primeiro encontro', 'Consulte as formas de atendimento',
      'Primeira sessão? Tire suas dúvidas', 'Conheça quem vai receber você', 'Vai remarcar? Fale com o profissional',
    ],
    subjects: ['Sessão de terapia', 'Primeiro atendimento', 'Sessão de acompanhamento'],
  },
  {
    segment: 'VETERINARY', category: 'veterinaria', label: 'Veterinária',
    titles: [
      'Conheça a clínica veterinária', 'Converse sobre a consulta do seu pet', 'Conte à equipe sobre a rotina do seu pet',
      'Confirme a consulta do seu pet', 'Anote suas dúvidas para o veterinário',
      'Pergunte quais registros levar', 'Consulte os atendimentos da clínica',
      'Pergunte como levar o pet à consulta', 'Conheça quem atende o seu pet', 'Não poderá vir? Avise a clínica',
    ],
    subjects: ['Consulta veterinária', 'Consulta de retorno', 'Orientação ao tutor', 'Acompanhamento veterinário'],
  },
  {
    segment: 'CAR_WASH', category: 'lava-jato', label: 'Lava jato',
    titles: [
      'Conheça o lava jato', 'Converse sobre a limpeza do seu veículo', 'Combine a lavagem e a retirada do carro',
      'Confirme o horário de trazer o carro', 'Pergunte sobre cuidados entre lavagens',
      'Retire seus objetos antes da lavagem', 'Consulte as opções de limpeza do veículo',
      'Não sabe qual lavagem escolher? Pergunte', 'Conheça quem cuida da limpeza do carro', 'Vai chegar mais tarde? Avise a equipe',
    ],
    subjects: ['Lavagem simples', 'Lavagem completa', 'Limpeza interna', 'Higienização de bancos', 'Enceramento'],
  },
  {
    segment: 'AUTO_REPAIR', category: 'oficina', label: 'Mecânica e oficina',
    titles: [
      'Conheça a oficina', 'Converse sobre a revisão do seu veículo', 'Avalie o orçamento antes de autorizar',
      'Combine a data de entrega do veículo', 'Consulte o plano de manutenção do carro',
      'Anote os sinais que percebeu no carro', 'Consulte os serviços da oficina',
      'Orçamento com dúvida? Peça explicações', 'Conheça quem cuida do seu veículo', 'Mudou a data? Fale com a oficina',
    ],
    subjects: ['Troca de óleo', 'Revisão periódica', 'Alinhamento e balanceamento', 'Avaliação de freios', 'Troca de filtros'],
  },
  {
    segment: 'PHOTO_STUDIO', category: 'fotografia', label: 'Fotografia',
    titles: [
      'Conheça o estúdio de fotografia', 'Converse sobre o ensaio que imagina', 'Combine o local e a entrega das fotos',
      'Confirme a data e o local do seu ensaio', 'Traga referências para planejar o ensaio',
      'Combine roupas e acessórios do ensaio', 'Consulte os tipos de ensaio e cobertura',
      'Entrega com dúvida? Fale com a equipe', 'Conheça quem fotografa você', 'Vai remarcar o ensaio? Entre em contato',
    ],
    subjects: ['Ensaio fotográfico', 'Retrato profissional', 'Ensaio de família', 'Cobertura de evento', 'Fotografia de produtos'],
  },
  {
    segment: 'TATTOO_PIERCING', category: 'tatuagem-piercing', label: 'Tatuagem e piercing',
    titles: [
      'Conheça o estúdio de tatuagem', 'Converse sobre o desenho que imagina', 'Combine o projeto antes da sessão',
      'Confirme a data e o tempo da sessão', 'Peça orientações para cuidar da tatuagem',
      'Traga suas referências para o projeto', 'Consulte os trabalhos do estúdio',
      'Primeira tatuagem? Tire suas dúvidas', 'Conheça quem cria no estúdio', 'Precisa remarcar? Avise o estúdio',
    ],
    subjects: ['Sessão de tatuagem', 'Desenho personalizado', 'Aplicação de piercing', 'Avaliação de projeto', 'Troca de joia'],
  },
  {
    segment: 'COACHING', category: 'consultoria', label: 'Consultoria e coaching',
    titles: [
      'Conheça a consultoria', 'Traga seu objetivo para uma conversa', 'Alinhe o escopo antes de iniciar',
      'Combine seu primeiro encontro', 'Anote as dúvidas que surgirem no caminho',
      'Organize suas prioridades para conversar', 'Consulte os formatos da consultoria',
      'Proposta com dúvidas? Peça explicações', 'Conheça quem acompanha seu projeto', 'Precisa remarcar? Avise a consultoria',
    ],
    subjects: ['Sessão de consultoria', 'Diagnóstico de negócio', 'Planejamento de projeto', 'Sessão de acompanhamento'],
  },
  {
    segment: 'PRIVATE_CLASSES', category: 'aulas', label: 'Aulas particulares',
    titles: [
      'Conheça o espaço de aprendizagem', 'Conte o que você quer aprender', 'Alinhe seu objetivo com o professor',
      'Combine seus horários de aula', 'Anote as dúvidas para a próxima aula',
      'Confirme o material para a primeira aula', 'Consulte os formatos de aula',
      'Por onde começar? Pergunte ao professor', 'Conheça quem acompanha seu aprendizado', 'Não poderá vir? Avise o professor',
    ],
    subjects: ['Aula particular', 'Aula experimental', 'Reforço escolar', 'Aula de idiomas', 'Aula de música'],
  },
  {
    segment: 'TECH_SUPPORT', category: 'assistencia-tecnica', label: 'Assistência técnica',
    titles: [
      'Conheça a assistência técnica', 'Conte o que acontece com seu equipamento', 'Avalie o orçamento antes de autorizar',
      'Combine a entrega e retirada do aparelho', 'Pergunte como preservar seus arquivos',
      'Anote as falhas que percebeu no aparelho', 'Consulte os serviços da assistência',
      'Dúvida sobre o reparo? Peça explicações', 'Conheça quem avalia seu equipamento', 'Confirme o horário de retirar o aparelho',
    ],
    subjects: ['Atendimento técnico', 'Avaliação de equipamento', 'Visita técnica', 'Limpeza de equipamento', 'Configuração de computador'],
  },
  {
    segment: 'HOME_SERVICES', category: 'servicos-domiciliares', label: 'Serviços domiciliares',
    titles: [
      'Conheça os serviços para sua casa', 'Conte qual serviço sua casa precisa', 'Combine o que está incluído na visita',
      'Confirme a data e o período da visita', 'Combine cuidados com objetos do ambiente',
      'Libere o acesso ao local do atendimento', 'Consulte os serviços domiciliares',
      'Combine os materiais antes da visita', 'Conheça quem vai atender na sua casa', 'Mudou o endereço? Avise antes da visita',
    ],
    subjects: ['Diária de limpeza', 'Visita técnica', 'Montagem de móveis', 'Pequenos reparos', 'Limpeza de ambientes'],
  },
  {
    segment: 'LAW_FIRM', category: 'advocacia', label: 'Advocacia',
    titles: [], subjects: [],
  },
  {
    segment: 'OTHER', category: 'outros', label: 'Outros serviços',
    titles: [
      'Conheça o nosso espaço', 'Conte qual serviço você procura', 'Combine os detalhes antes do atendimento',
      'Confirme seu horário antes de vir', 'Anote suas dúvidas para o atendimento',
      'Pergunte o que levar para o atendimento', 'Consulte os nossos serviços',
      'Por onde começar? Fale com a equipe', 'Conheça quem atende você', 'Precisa remarcar? Entre em contato',
    ],
    subjects: ['Atendimento inicial', 'Serviço com agendamento', 'Acompanhamento', 'Visita profissional'],
  },
];

/** Unknown and missing segments receive the neutral collection, never a guessed business type. */
export function postCategoryForSegment(segment?: string | null): PostCategoryCollection {
  return POST_CATEGORY_COLLECTIONS.find(collection => collection.segment === segment)
    ?? POST_CATEGORY_COLLECTIONS.find(collection => collection.segment === 'OTHER')!;
}
