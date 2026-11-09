import type { LegalPostData } from './legalPostTemplates'

export interface LegalPostSample {
	templateKey: string
	title: string
	ctaText: string
	legalPost: LegalPostData
}

/** Fictional review fixtures only. Never loaded as production identity or copy. */
const identity = {
	professionalName: 'Bruno Azevedo',
	registration: 'OAB/RS 00.000',
	contact: '(51) 00000-0000',
	address: 'Porto Alegre',
	website: 'exemplo.com.br',
	contactLayout: 'essential' as const,
}

export const LEGAL_POST_SAMPLES: readonly LegalPostSample[] = [
	{
		templateKey: 'advocacia-cartao',
		title: 'Atuação em Porto Alegre',
		ctaText: 'Conheça a atuação',
		legalPost: { ...identity, areas: [
			{ title: 'Trabalho', description: '' },
			{ title: 'Contratos', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-areas',
		title: 'Áreas de atuação',
		ctaText: 'Tire sua dúvida',
		legalPost: { ...identity, areas: [
			{ title: 'Trabalho', description: '' },
			{ title: 'Consumo', description: '' },
			{ title: 'Família', description: '' },
			{ title: 'Contratos', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-trabalhista',
		title: 'Só um trecho basta?',
		ctaText: 'Salve para consultar',
		legalPost: { ...identity, summary: 'Envie também os anexos e aditivos.', areas: [] },
	},
	{
		templateKey: 'advocacia-consumidor',
		title: 'Antes de assinar',
		ctaText: 'Salve esta lista',
		legalPost: { ...identity, areas: [
			{ title: 'Confira as partes', description: '' },
			{ title: 'Revise valores e prazos', description: '' },
			{ title: 'Anote suas dúvidas', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-familia',
		title: 'Como começa',
		ctaText: 'Converse com o escritório',
		legalPost: { ...identity, areas: [
			{ title: 'Conte o assunto', description: '' },
			{ title: 'Alinhe o serviço', description: '' },
			{ title: 'Avalie a proposta', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-previdenciario',
		title: 'O que reunir',
		ctaText: 'Confira os documentos',
		legalPost: { ...identity, eyebrow: 'TRABALHO', areas: [
			{ title: 'Contrato e aditivos', description: '' },
			{ title: 'Recibos', description: '' },
			{ title: 'Mensagens', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-empresarial',
		title: 'Pedido inesperado?',
		ctaText: 'Compartilhe este cuidado',
		legalPost: { ...identity, areas: [
			{ title: 'Verifique o remetente', description: '' },
			{ title: 'Use um canal conhecido', description: '' },
		] },
	},
	{
		templateKey: 'advocacia-contratos',
		title: 'Qual tema vem depois?',
		ctaText: 'Envie uma sugestão',
		legalPost: { ...identity, summary: 'Trabalho ou contratos?', areas: [] },
	},
	{
		templateKey: 'advocacia-perfil',
		title: 'Bruno Azevedo',
		ctaText: 'Fale com o profissional',
		legalPost: { ...identity, summary: 'Trabalho e contratos', areas: [] },
	},
	{
		templateKey: 'advocacia-comunicado',
		title: 'Horário especial',
		ctaText: 'Confira a agenda',
		legalPost: { ...identity, eyebrow: 'NOVEMBRO 2026', highlight: '23 NOV', summary: 'das 13h às 18h', areas: [] },
	},
]
