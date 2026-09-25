import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";
import type { IHashProvider } from "../src/shared/container/providers/HashProvider/IHashProvider";
import { seedBarbershopDefaults } from "../src/shared/utils/seedBarbershopDefaults";

export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
export const SYSTEM_USER_EMAIL = "system@agendai.internal";
export const DEMO_BARBERSHOP_ID = "d0000000-0000-4000-8000-000000000001";
export const DEMO_BARBERSHOP_NAME = "AgendAI CRM Demo";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SeedProfile = "base" | "demo" | "all";

export interface SeedCliArgs {
	profile?: string;
	tenant: boolean;
	barbershopId?: string;
}

/**
 * Estratégia de captura (jul/2026):
 * - Trial 30 dias full Pro, sem cartão (já no produto)
 * - Essencial R$14: operação (fila/agenda/equipe ilimitada), sem dashboard
 * - Pro R$20: acesso completo (relatórios + financeiro)
 * - Anual: ~2 meses grátis (10× preço mensal) — melhor retenção vs desconto % puro
 */
export const defaultPlans = [
	{
		name: 'Essencial',
		description:
			'Fila, agenda e equipe ilimitada. Ideal para começar — sem relatórios avançados.',
		price: 14.0,
		billingCycle: 'MONTHLY' as const,
		maxEmployees: 0,
		hasDashboard: false,
		tierKey: 'essential',
		features: [
			'Fila digital ilimitada',
			'Agendamentos online 24h',
			'Funcionários ilimitados',
			'Perfil e feed do salão',
			'Suporte por e-mail',
			'Sem dashboard de relatórios/financeiro',
		],
	},
	{
		name: 'Essencial Anual',
		description:
			'Mesmo Essencial, cobrado anualmente. Equivale a 10 meses — 2 meses grátis.',
		price: 140.0, // 14 × 10
		billingCycle: 'YEARLY' as const,
		maxEmployees: 0,
		hasDashboard: false,
		tierKey: 'essential',
		features: [
			'Tudo do Essencial',
			'2 meses grátis (pague 10, use 12)',
			'Funcionários ilimitados',
			'Prioridade na fila de suporte',
		],
	},
	{
		name: 'Pro',
		description:
			'Acesso completo: operação + dashboard de relatórios e financeiro do salão.',
		price: 20.0,
		billingCycle: 'MONTHLY' as const,
		maxEmployees: 0,
		hasDashboard: true,
		tierKey: 'pro',
		features: [
			'Tudo do Essencial',
			'Dashboard de relatórios',
			'Painel financeiro (despesas e fiado)',
			'Insights de movimento',
			'Funcionários ilimitados',
			'Suporte prioritário',
		],
	},
	{
		name: 'Pro Anual',
		description:
			'Pro completo no anual. Equivale a 10 meses — 2 meses grátis (melhor retenção).',
		price: 200.0, // 20 × 10
		billingCycle: 'YEARLY' as const,
		maxEmployees: 0,
		hasDashboard: true,
		tierKey: 'pro',
		features: [
			'Tudo do Pro',
			'2 meses grátis (pague 10, use 12)',
			'Dashboard + financeiro',
			'Melhor custo anual da plataforma',
		],
	},
]

export function createSeedClient() {
	const connectionString = process.env.DATABASE_URL
	if (!connectionString) {
		throw new Error('DATABASE_URL não configurada')
	}
	const pool = new Pool({ connectionString })
	const adapter = new PrismaPg(pool as any)
	return new PrismaClient({ adapter: adapter as any } as any)
}

/**
 * O seed só roda como CLI (`tsx prisma/seed.ts`). Importar este módulo (ex.: no
 * spec) NÃO dispara main() — protegido por require.main e pelo caminho do
 * script em process.argv[1].
 */
export function isDirectExecution(): boolean {
	if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
		return true
	}
	const entry = process.argv[1]
	return typeof entry === 'string' && /[\\/]prisma[\\/]seed\.(ts|js|mts|cts|mjs)$/.test(entry)
}

export function parseCliArgs(argv: string[]): SeedCliArgs {
	const args: SeedCliArgs = { tenant: false }
	for (const arg of argv) {
		if (arg === '--tenant') {
			args.tenant = true
		} else if (arg === '--demo') {
			args.profile = 'demo'
		} else if (arg.startsWith('--profile=')) {
			args.profile = arg.slice('--profile='.length)
		} else if (arg.startsWith('--barbershopId=')) {
			args.barbershopId = arg.slice('--barbershopId='.length)
		} else {
			throw new Error(`Argumento desconhecido: ${arg}`)
		}
	}
	if (args.tenant && !args.barbershopId) {
		throw new Error('--tenant exige --barbershopId=<uuid>')
	}
	if (!args.tenant && args.barbershopId) {
		throw new Error('--barbershopId só faz sentido com --tenant')
	}
	return args
}

export function resolveSeedProfile(cliProfile?: string): SeedProfile {
	const raw = (cliProfile ?? process.env.SEED_PROFILE ?? 'base').trim().toLowerCase()
	if (raw === 'base' || raw === 'demo' || raw === 'all') {
		return raw
	}
	throw new Error(`SEED_PROFILE inválido: ${raw} (esperado base|demo|all)`)
}

export function looksLikeProductionEnvironment(
	env: NodeJS.ProcessEnv = process.env,
	databaseUrl: string = env.DATABASE_URL ?? '',
): boolean {
	if (env.NODE_ENV === 'production') return true
	try {
		const url = new URL(databaseUrl)
		const dbName = url.pathname.replace(/^\//, '')
		if (/prod/i.test(dbName)) return true
		if (/prod/i.test(url.hostname)) return true
	} catch {
		// URL inválida: não conclusivo, não bloqueia por aqui.
	}
	return false
}

export async function seedSystemUser(client: any, hashProvider: IHashProvider) {
	const existing = await client.user.findFirst({
		where: { OR: [{ id: SYSTEM_USER_ID }, { email: SYSTEM_USER_EMAIL }] },
	})
	if (existing) {
		console.log('ℹ️ Usuário-sistema já existe')
		return
	}
	const password = await hashProvider.hash(`system-${Date.now()}-${Math.random()}`)
	await client.user.create({
		data: {
			id: SYSTEM_USER_ID,
			name: 'Sistema',
			email: SYSTEM_USER_EMAIL,
			password,
			role: Role.MASTER_ADMIN,
			cpf: null,
			active: false,
		},
	})
	console.log('✅ Usuário-sistema criado')
}

export async function seedPlans(client: any) {
	// Desativa planos legados (Mensal/Anual genéricos)
	const legacy = await client.plan.updateMany({
		where: { name: { in: ['Mensal', 'Anual'] }, active: true },
		data: { active: false },
	})
	if (legacy.count > 0) {
		console.log(`✅ ${legacy.count} plano(s) legado(s) desativado(s)`)
	}

	for (const plan of defaultPlans) {
		const existingPlan = await client.plan.findFirst({
			where: { name: plan.name },
		})
		if (!existingPlan) {
			await client.plan.create({ data: plan })
			console.log(`✅ Plano criado: ${plan.name}`)
		} else {
			await client.plan.update({
				where: { id: existingPlan.id },
				data: {
					description: plan.description,
					price: plan.price,
					billingCycle: plan.billingCycle,
					maxEmployees: plan.maxEmployees,
					hasDashboard: plan.hasDashboard,
					tierKey: plan.tierKey,
					features: plan.features,
					active: true,
				},
			})
			console.log(`✅ Plano atualizado: ${plan.name}`)
		}
	}
}

export async function seedMasterAdmin(client: any, hashProvider: IHashProvider) {
	const email = process.env.SEED_MASTER_ADMIN_EMAIL?.trim()
	const password = process.env.SEED_MASTER_ADMIN_PASSWORD
	if (!email || !password) {
		console.log(
			'ℹ️ Admin master ignorado: defina SEED_MASTER_ADMIN_EMAIL e SEED_MASTER_ADMIN_PASSWORD',
		)
		return
	}
	if (process.env.NODE_ENV === 'production') {
		console.log('ℹ️ Admin master ignorado: NODE_ENV=production')
		return
	}
	const existing = await client.user.findFirst({ where: { email } })
	if (existing) {
		console.log(`ℹ️ Admin master já existe: ${email}`)
		return
	}
	const hashed = await hashProvider.hash(password)
	await client.user.create({
		data: {
			name: 'Administrador',
			email,
			password: hashed,
			role: Role.MASTER_ADMIN,
			cpf: null,
			active: true,
		},
	})
	console.log(`✅ Admin master criado: ${email}`)
}

export async function seedGlobalReferenceData(client: any) {
	const serviceCategory = await client.serviceCategory.findFirst({
		where: { barbershopId: null, name: 'Serviços' },
	})
	if (!serviceCategory) {
		await client.serviceCategory.create({
			data: { barbershopId: null, name: 'Serviços', icon: 'sparkles' },
		})
		console.log('✅ Categoria global de serviço criada: Serviços')
	}

	const expenseCategory = await client.expenseCategory.findFirst({
		where: { barbershopId: null, name: 'Compra de estoque' },
	})
	if (!expenseCategory) {
		await client.expenseCategory.create({
			data: { barbershopId: null, name: 'Compra de estoque' },
		})
		console.log('✅ Categoria global de despesa criada: Compra de estoque')
	}
}

export async function seedDemoData(client: any) {
	if (process.env.SEED_DEMO !== 'true') {
		throw new Error('Seed demo exige SEED_DEMO=true')
	}
	if (looksLikeProductionEnvironment()) {
		throw new Error('Seed demo bloqueado em ambiente de produção')
	}

	const existing = await client.barbershop.findUnique({
		where: { id: DEMO_BARBERSHOP_ID },
	})
	if (existing && existing.name !== DEMO_BARBERSHOP_NAME) {
		throw new Error('UUID de demo já pertence a outro salão; abortando')
	}

	await client.$transaction(async (tx: any) => {
		await tx.barbershop.upsert({
			where: { id: DEMO_BARBERSHOP_ID },
			create: {
				id: DEMO_BARBERSHOP_ID,
				name: DEMO_BARBERSHOP_NAME,
				whatsapp: '11999990000',
				address: 'Rua da Demonstração, 100',
				city: 'São Paulo',
				latitude: -23.5505,
				longitude: -46.6333,
				active: true,
				approvalStatus: 'APPROVED',
			},
			update: {
				name: DEMO_BARBERSHOP_NAME,
				active: true,
				approvalStatus: 'APPROVED',
			},
		})
		await seedBarbershopDefaults(tx, DEMO_BARBERSHOP_ID)
	})
	console.log(`✅ Salão demo pronto: ${DEMO_BARBERSHOP_ID}`)
}

export async function seedTenantDefaults(client: any, barbershopId: string) {
	if (!UUID_PATTERN.test(barbershopId)) {
		throw new Error(`barbershopId inválido: ${barbershopId}`)
	}
	const barbershop = await client.barbershop.findUnique({ where: { id: barbershopId } })
	if (!barbershop) {
		throw new Error(`Barbearia não encontrada: ${barbershopId}`)
	}
	await client.$transaction(async (tx: any) => {
		await seedBarbershopDefaults(tx, barbershopId)
	})
	console.log(`✅ Defaults aplicados na barbearia ${barbershopId}`)
}

export async function runSeed(
	client: any,
	hashProvider: IHashProvider,
	options: SeedCliArgs = { tenant: false },
) {
	if (options.tenant) {
		await seedTenantDefaults(client, options.barbershopId as string)
		return
	}

	const profile = resolveSeedProfile(options.profile)
	if (profile === 'base' || profile === 'all') {
		await seedSystemUser(client, hashProvider)
		await seedPlans(client)
		await seedMasterAdmin(client, hashProvider)
		await seedGlobalReferenceData(client)
	}
	if (profile === 'demo' || profile === 'all') {
		await seedDemoData(client)
	}
}

async function main() {
	const args = parseCliArgs(process.argv.slice(2))
	const client = createSeedClient()
	const hashProvider = new BcryptHashProvider()
	try {
		await runSeed(client, hashProvider, args)
	} finally {
		await client.$disconnect()
	}
}

if (isDirectExecution()) {
	main()
		.then(() => {
			console.log('✅ Seed concluído')
		})
		.catch((e: unknown) => {
			console.error(e)
			process.exit(1)
		})
}
