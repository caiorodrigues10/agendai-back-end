export interface LegalPostData {
	professionalName: string
	registration: string
	areas: { title: string; description: string }[]
	eyebrow?: string
	summary?: string
	highlight?: string
	contact?: string
	address?: string
	website?: string
	contactLayout?: 'essential' | 'complete'
}

/** Informative copy only; never populated from client/case data. */
export const LEGAL_POST_TEMPLATES = [
	[
		'advocacia-cartao',
		'Identidade do escritório',
		'Conheça o escritório',
		'Apresentação com localidade, atuação confirmada e canais reais de atendimento.',
	],
	[
		'advocacia-areas',
		'Mapa de atuação',
		'Qual é o seu tema?',
		'Até quatro áreas informadas pelo escritório, com descrição curta de cada assunto.',
	],
	[
		'advocacia-trabalhista',
		'Pergunta e resposta',
		'Vale para o meu caso?',
		'Uma dúvida em destaque, resposta objetiva e orientação de apoio sem prometer resultados.',
	],
	[
		'advocacia-consumidor',
		'Checklist de contratos',
		'Contrato em mãos?',
		'Pontos de leitura para organizar dúvidas sobre um contrato, em itens curtos e claros.',
	],
	[
		'advocacia-familia',
		'Etapas de contratação',
		'Como contratar?',
		'Sequência de contato, alinhamento e proposta conforme o processo informado pelo escritório.',
	],
	[
		'advocacia-previdenciario',
		'Guia de registros',
		'Registros do seu assunto',
		'Tipos de registro relacionados ao assunto, sem solicitar dados pessoais na publicação.',
	],
	[
		'advocacia-empresarial',
		'Contato seguro',
		'Contato inesperado?',
		'Orientação para confirmar a origem de pedidos de dados ou pagamentos pelos canais conhecidos.',
	],
	[
		'advocacia-contratos',
		'Pauta aberta',
		'Que tema vem depois?',
		'Convite para sugerir conteúdos informativos, sem expor detalhes de casos ou dados pessoais.',
	],
	[
		'advocacia-perfil',
		'Perfil profissional',
		'Conheça quem atende',
		'Nome, inscrição, localidade, modalidade e foto fornecidos pelo responsável, sem qualificações inventadas.',
	],
	[
		'advocacia-comunicado',
		'Aviso com data',
		'Horário especial',
		'Data e horário informados em destaque, com instrução clara para organizar o contato.',
	],
] as const

export function legalTemplateIndex(key?: string): number {
	return LEGAL_POST_TEMPLATES.findIndex((template) => template[0] === key)
}

export function readLegalPost(options: unknown): LegalPostData | undefined {
	if (!options || typeof options !== 'object') return undefined
	return (options as { legalPost?: LegalPostData }).legalPost
}

export function legalPostMissingReason(data?: LegalPostData, templateKey?: string): string | null {
	if (!data?.professionalName.trim() || !data.registration.trim())
		return 'Informe o nome profissional e a inscrição na OAB antes de publicar'
	const hasArea = data.areas.some((area) => area.title.trim())
	if (templateKey === 'advocacia-trabalhista')
		return data.summary?.trim() || data.highlight?.trim() ? null : 'Inclua a resposta à pergunta antes de publicar'
	if (templateKey === 'advocacia-comunicado')
		return data.highlight?.trim() ? null : 'Informe a data ou o período do aviso antes de publicar'
	if (templateKey === 'advocacia-perfil')
		return data.summary?.trim() || hasArea ? null : 'Inclua a apresentação do profissional antes de publicar'
	if (templateKey === 'advocacia-contratos')
		return data.summary?.trim() || hasArea ? null : 'Inclua um tema ou uma orientação para participar antes de publicar'
	return hasArea ? null : 'Inclua ao menos um bloco de conteúdo antes de publicar'
}

export function legalPostReady(data?: LegalPostData, templateKey?: string): boolean {
	return legalPostMissingReason(data, templateKey) === null
}

const defaultCtas: Record<string, string> = {
	'advocacia-cartao': 'Conheça a atuação',
	'advocacia-areas': 'Tire sua dúvida',
	'advocacia-trabalhista': 'Salve para consultar',
	'advocacia-consumidor': 'Salve esta lista',
	'advocacia-familia': 'Converse com o escritório',
	'advocacia-previdenciario': 'Confira os documentos',
	'advocacia-empresarial': 'Compartilhe este cuidado',
	'advocacia-contratos': 'Envie uma sugestão',
	'advocacia-perfil': 'Fale com o profissional',
	'advocacia-comunicado': 'Confira a agenda',
}

export function legalDefaultCta(templateKey?: string): string {
	return defaultCtas[templateKey ?? ''] ?? 'Converse com o escritório'
}
