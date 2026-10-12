/**
 * Seed idempotente do fixture `[QA]` da checagem geral (2ª rodada).
 *
 * Cria um SEGUNDO tenant com salão ACTIVE (sem paywall) para:
 *   - varredura de tenant/IDOR com token de outro salão;
 *   - fluxos E2E de dono, funcionário e cliente no navegador.
 *
 * Tudo é prefixado com `[QA]` e removível com `--purge --confirm`.
 * Nenhum dado de terceiro é tocado; nada aqui roda em produção.
 *
 * Uso:
 *   npm run prisma:seed:qa-fixture                       # seed idempotente
 *   npm run prisma:seed:qa-fixture -- --list             # lista o que existe (leitura)
 *   npm run prisma:seed:qa-fixture -- --purge            # DRY-RUN do que seria apagado
 *   npm run prisma:seed:qa-fixture -- --purge --confirm  # apaga o fixture [QA]
 *
 * Senhas: variáveis de ambiente do processo (SEED_QA_*), com default só local.
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";
import { seedBarbershopDefaults } from "../src/shared/utils/seedBarbershopDefaults";
import { TRIAL_DAYS } from "../src/shared/constants/subscription";
import { looksLikeProductionEnvironment } from "../prisma/seed";

export const QA_SHOP_ID = "a11ce000-0000-4000-8000-00000000000b";
export const QA_SHOP_NAME = "[QA] Salao Beta";
export const QA_OWNER_EMAIL = "qa.owner@agendai.local";
export const QA_EMPLOYEE_EMAIL = "qa.employee@agendai.local";
export const QA_CLIENT_NAME = "[QA] Cliente Beta";
export const QA_CLIENT_WHATSAPP = "11988880001";
export const DEFAULT_QA_PASSWORD = "qa-fixture-123";

export interface QaFixtureArgs {
	list: boolean;
	purge: boolean;
	confirm: boolean;
}

export function parseQaFixtureArgs(argv: string[]): QaFixtureArgs {
	const args: QaFixtureArgs = { list: false, purge: false, confirm: false };
	for (const arg of argv) {
		if (arg === "--list") args.list = true;
		else if (arg === "--purge") args.purge = true;
		else if (arg === "--confirm") args.confirm = true;
		else throw new Error(`Argumento desconhecido: ${arg}`);
	}
	if (args.confirm && !args.purge) throw new Error("--confirm só faz sentido com --purge");
	return args;
}

function password(envName: string): string {
	return process.env[envName] ?? DEFAULT_QA_PASSWORD;
}

export async function seedQaFixture(
	client: any,
	hashProvider: { hash: (v: string) => Promise<string> },
): Promise<{ created: boolean }> {
	if (looksLikeProductionEnvironment()) {
		throw new Error("Seed do fixture [QA] bloqueado em ambiente de produção");
	}

	const existing = await client.barbershop.findUnique({ where: { id: QA_SHOP_ID } });
	if (existing && existing.name !== QA_SHOP_NAME) {
		throw new Error("UUID do fixture [QA] já pertence a outro salão; abortando");
	}

	const ownerPassword = await hashProvider.hash(password("SEED_QA_OWNER_PASSWORD"));
	const employeePassword = await hashProvider.hash(password("SEED_QA_EMPLOYEE_PASSWORD"));
	const now = new Date();
	const activeUntil = new Date(now);
	activeUntil.setDate(activeUntil.getDate() + TRIAL_DAYS);

	await client.$transaction(async (tx: any) => {
		await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${QA_SHOP_ID}, TRUE)`;

		await tx.barbershop.upsert({
			where: { id: QA_SHOP_ID },
			create: {
				id: QA_SHOP_ID,
				name: QA_SHOP_NAME,
				whatsapp: "11988880001",
				address: "Rua QA, 100",
				city: "São Paulo",
				active: true,
				approvalStatus: "APPROVED",
				operationMode: "HYBRID",
			},
			update: {
				name: QA_SHOP_NAME,
				active: true,
				approvalStatus: "APPROVED",
				operationMode: "HYBRID",
			},
		});

		await seedBarbershopDefaults(tx, QA_SHOP_ID);

		const plan = await tx.plan.findFirst({ where: { name: "Essencial", active: true } });
		if (!plan) throw new Error("Plano 'Essencial' não existe no banco");

		// Assinatura ACTIVE: sem paywall no front e sem 402 no checkSubscription.
		await tx.subscription.upsert({
			where: { barbershopId: QA_SHOP_ID },
			create: {
				barbershopId: QA_SHOP_ID,
				planId: plan.id,
				status: "ACTIVE",
				startDate: now,
				endDate: activeUntil,
			},
			update: { status: "ACTIVE", startDate: now, endDate: activeUntil },
		});

		await tx.user.upsert({
			where: { email: QA_OWNER_EMAIL },
			create: {
				name: "[QA] Dono Beta",
				email: QA_OWNER_EMAIL,
				password: ownerPassword,
				role: "OWNER",
				barbershopId: QA_SHOP_ID,
				emailVerified: true,
				active: true,
			},
			update: { barbershopId: QA_SHOP_ID, role: "OWNER", active: true, deletedAt: null },
		});

		await tx.user.upsert({
			where: { email: QA_EMPLOYEE_EMAIL },
			create: {
				name: "[QA] Funcionario Beta",
				email: QA_EMPLOYEE_EMAIL,
				password: employeePassword,
				role: "EMPLOYEE",
				barbershopId: QA_SHOP_ID,
				emailVerified: true,
				active: true,
			},
			update: { barbershopId: QA_SHOP_ID, role: "EMPLOYEE", active: true, deletedAt: null },
		});

		const clientRow = await tx.salonClient.findFirst({
			where: { barbershopId: QA_SHOP_ID, name: QA_CLIENT_NAME },
		});
		if (!clientRow) {
			await tx.salonClient.create({
				data: {
					barbershopId: QA_SHOP_ID,
					name: QA_CLIENT_NAME,
					whatsapp: QA_CLIENT_WHATSAPP,
					normalizedWhatsapp: QA_CLIENT_WHATSAPP,
				},
			});
		}
	});

	return { created: !existing };
}

export async function listQaFixture(client: any) {
	const shop = await client.barbershop.findUnique({ where: { id: QA_SHOP_ID } });
	if (!shop) {
		console.log("Fixture [QA] inexistente.");
		return { shop: null, users: [], clients: 0 };
	}
	const users = await client.user.findMany({
		where: { barbershopId: QA_SHOP_ID, deletedAt: null },
		select: { email: true, role: true, active: true, id: true },
	});
	const clients = await client.salonClient.count({ where: { barbershopId: QA_SHOP_ID } });
	console.log(`— Fixture [QA] ${QA_SHOP_ID} "${shop.name}" (${users.length} usuário(s), ${clients} cliente(s)) —`);
	for (const u of users) console.log(`  user ${u.email.padEnd(34)} role=${u.role} active=${u.active}`);
	return { shop, users, clients };
}

export async function purgeQaFixture(client: any, confirm: boolean) {
	const shop = await client.barbershop.findUnique({ where: { id: QA_SHOP_ID } });
	console.log(`— Purge do fixture [QA] (NADA é apagado sem --confirm) —`);
	console.log(`  salão ${QA_SHOP_ID} ${shop ? `"${shop.name}"` : "(inexistente)"}`);
	if (!shop) return { purged: false };

	if (!confirm) {
		console.log("DRY-RUN: adicione --confirm para apagar de fato (somente local/teste).");
		return { purged: false };
	}
	if (looksLikeProductionEnvironment()) {
		throw new Error("Purge bloqueado em ambiente de produção");
	}

	await client.$transaction(async (tx: any) => {
		await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${QA_SHOP_ID}, TRUE)`;
		// Usuários, clientes e demais linhas do tenant caem em cascata pelo FK.
		await tx.barbershop.delete({ where: { id: QA_SHOP_ID } });
	});
	console.log("✅ Fixture [QA] removido (salão + dados do tenant em cascata).");
	return { purged: true };
}

function createClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("DATABASE_URL não configurada");
	const pool = new Pool({ connectionString });
	const adapter = new PrismaPg(pool as any);
	return new PrismaClient({ adapter: adapter as any } as any);
}

export function isDirectExecution(): boolean {
	const entry = process.argv[1];
	return typeof entry === "string" && /seed-qa-fixture\.(ts|js|mts|cts|mjs)$/.test(entry);
}

async function main() {
	const args = parseQaFixtureArgs(process.argv.slice(2));
	const client = createClient();
	const hashProvider = new BcryptHashProvider();
	try {
		if (args.list) await listQaFixture(client);
		else if (args.purge) await purgeQaFixture(client, args.confirm);
		else {
			const r = await seedQaFixture(client, hashProvider);
			console.log(`✅ Fixture [QA] pronto: ${QA_SHOP_ID} (${r.created ? "criado" : "já existia"})`);
		}
	} finally {
		await client.$disconnect();
	}
}

if (isDirectExecution()) {
	main().catch((e: unknown) => {
		console.error(e);
		process.exit(1);
	});
}
