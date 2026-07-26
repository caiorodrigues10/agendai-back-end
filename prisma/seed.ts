import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Role } from '@prisma/client'
import { BcryptHashProvider } from '../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider'

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter: adapter as any } as any)

/**
 * Estratégia de captura (jul/2026):
 * - Trial 30 dias full Pro, sem cartão (já no produto)
 * - Essencial R$14: operação (fila/agenda/equipe ilimitada), sem dashboard
 * - Pro R$20: acesso completo (relatórios + financeiro)
 * - Anual: ~2 meses grátis (10× preço mensal) — melhor retenção vs desconto % puro
 */
const defaultPlans = [
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

async function main() {
	const hashProvider = new BcryptHashProvider()

	const adminEmail = 'admin@barberqueue.local'
	const existingAdmin = await prisma.user.findUnique({
		where: { email: adminEmail },
	})
	if (!existingAdmin) {
		const password = await hashProvider.hash('admin123')
		await prisma.user.create({
			data: {
				name: 'Administrador',
				email: adminEmail,
				password,
				role: Role.MASTER_ADMIN,
				cpf: null,
				active: true,
			},
		})
		console.log('✅ Admin criado')
	}

	const systemUser = await prisma.user.findUnique({
		where: { email: 'system@barberqueue.internal' },
	})
	if (!systemUser) {
		const fakePassword = await hashProvider.hash(
			`system-${Date.now()}-${Math.random()}`,
		)
		const { Prisma: PrismaNamespace } = await import('@prisma/client')
		await prisma.$executeRaw(
			PrismaNamespace.sql`
        INSERT INTO users (id, name, email, password, role, cpf, active, created_at, updated_at)
        VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          'Sistema',
          'system@barberqueue.internal',
          ${fakePassword},
          ${Role.MASTER_ADMIN}::"Role",
          NULL,
          false,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `,
		)
		console.log('✅ Usuário-sistema criado')
	}

	// Desativa planos legados (Mensal/Anual genéricos)
	const legacy = await prisma.plan.updateMany({
		where: { name: { in: ['Mensal', 'Anual'] }, active: true },
		data: { active: false },
	})
	if (legacy.count > 0) {
		console.log(`✅ ${legacy.count} plano(s) legado(s) desativado(s)`)
	}

	for (const plan of defaultPlans) {
		const existingPlan = await prisma.plan.findFirst({
			where: { name: plan.name },
		})
		if (!existingPlan) {
			await prisma.plan.create({ data: plan })
			console.log(`✅ Plano criado: ${plan.name}`)
		} else {
			await prisma.plan.update({
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

main()
	.then(async () => {
		await prisma.$disconnect()
		console.log('✅ Seed concluído')
	})
	.catch(async (e) => {
		console.error(e)
		await prisma.$disconnect()
		process.exit(1)
	})
