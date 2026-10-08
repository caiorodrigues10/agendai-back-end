/**
 * Seed idempotente do fixture de performance (fila pública).
 *
 * Cria/atualiza o salão "Barbearia Sintetica Perf" (UUID fixo usado em todas as
 * medições LCP do frontend) + defaults + 30 produtos sintéticos + dono local.
 * Rodar N vezes não duplica nada (upsert por UUID/nome).
 *
 * Uso:
 *   npm run prisma:seed:perf-fixture                  # seed idempotente
 *   npm run prisma:seed:perf-fixture -- --list-accounts   # lista contas de teste (leitura)
 *   npm run prisma:seed:perf-fixture -- --purge           # DRY-RUN do que seria apagado
 *   npm run prisma:seed:perf-fixture -- --purge --confirm # apaga fixture perf (com confirmação)
 *
 * Guards: recusa produção (looksLikeProductionEnvironment). Senha do dono via
 * SEED_PERF_OWNER_PASSWORD (default local-only "perf-fixture-123").
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { BcryptHashProvider } from "../src/shared/container/providers/HashProvider/implementations/BcryptHashProvider";
import { seedBarbershopDefaults } from "../src/shared/utils/seedBarbershopDefaults";
import { looksLikeProductionEnvironment } from "../prisma/seed";

export const PERF_BARBERSHOP_ID = "1ac5be50-6ce7-464e-bc38-ab18cf24aeab";
export const PERF_BARBERSHOP_NAME = "Barbearia Sintetica Perf";
export const PERF_OWNER_EMAIL = "perf.owner@agendai.local";
export const PERF_PRODUCT_COUNT = 30;
/** UUID fixo do Produto Sintetico 01 — referenciado nas medições de produto. */
export const PERF_FIRST_PRODUCT_ID = "68b80815-d9b5-4f0f-a264-c1a2cc34284c";

export const DEFAULT_PERF_OWNER_PASSWORD = "perf-fixture-123";

export interface PerfFixtureArgs {
	listAccounts: boolean;
	purge: boolean;
	confirm: boolean;
}

export function parsePerfFixtureArgs(argv: string[]): PerfFixtureArgs {
	const args: PerfFixtureArgs = { listAccounts: false, purge: false, confirm: false };
	for (const arg of argv) {
		if (arg === "--list-accounts") args.listAccounts = true;
		else if (arg === "--purge") args.purge = true;
		else if (arg === "--confirm") args.confirm = true;
		else throw new Error(`Argumento desconhecido: ${arg}`);
	}
	if (args.confirm && !args.purge) {
		throw new Error("--confirm só faz sentido com --purge")
	}
	return args;
}

/** Contas consideradas "de teste" para listagem (padrões de e2e/fixture local). */
export function isTestAccountEmail(email: string): boolean {
	const e = email.toLowerCase();
	return (
		e.startsWith("e2e.") ||
		e.startsWith("perf.") ||
		e.endsWith("@agendai.local") ||
		e.endsWith("@teste.dev")
	);
}

/** Nome de salão criado por specs/fixtures de teste. */
export function isTestShopName(name: string): boolean {
	const n = name.toLowerCase();
	return n.includes("e2e") || n.includes("smoke") || n.includes("sintetica") || n.includes("perf fixture");
}

export function buildPerfProducts(): Array<{
	id?: string;
	index: number;
	name: string;
	salePrice: number;
	stockQty: number;
	type: "RETAIL" | "CONSUMABLE";
}> {
	return Array.from({ length: PERF_PRODUCT_COUNT }, (_, i) => ({
		// Só o primeiro tem UUID fixo (URLs de produto nas medições).
		...(i === 0 ? { id: PERF_FIRST_PRODUCT_ID } : {}),
		index: i,
		name: `Produto Sintetico ${String(i + 1).padStart(2, "0")}`,
		salePrice: 9 + i * 1.5,
		stockQty: 2 + i,
		type: i % 3 === 2 ? "CONSUMABLE" : ("RETAIL" as const),
	}));
}

export async function seedPerfFixture(client: any, hashProvider: { hash: (v: string) => Promise<string> }) {
	if (looksLikeProductionEnvironment()) {
		throw new Error("Seed de fixture perf bloqueado em ambiente de produção");
	}

	const existing = await client.barbershop.findUnique({ where: { id: PERF_BARBERSHOP_ID } });
	if (existing && existing.name !== PERF_BARBERSHOP_NAME) {
		throw new Error("UUID do fixture perf já pertence a outro salão; abortando");
	}

	const ownerPassword = await hashProvider.hash(
		process.env.SEED_PERF_OWNER_PASSWORD ?? DEFAULT_PERF_OWNER_PASSWORD,
	);

	await client.$transaction(async (tx: any) => {
		await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${PERF_BARBERSHOP_ID}, TRUE)`;

		await tx.barbershop.upsert({
			where: { id: PERF_BARBERSHOP_ID },
			create: {
				id: PERF_BARBERSHOP_ID,
				name: PERF_BARBERSHOP_NAME,
				whatsapp: "11999994444",
				address: "Rua da Performance, 404",
				city: "São Paulo",
				latitude: -23.5505,
				longitude: -46.6333,
				active: true,
				approvalStatus: "APPROVED",
				operationMode: "HYBRID",
			},
			update: {
				name: PERF_BARBERSHOP_NAME,
				active: true,
				approvalStatus: "APPROVED",
				operationMode: "HYBRID",
			},
		});

		await seedBarbershopDefaults(tx, PERF_BARBERSHOP_ID);

		for (const product of buildPerfProducts()) {
			const data = {
				barbershopId: PERF_BARBERSHOP_ID,
				name: product.name,
				salePrice: product.salePrice,
				stockQty: product.stockQty,
				minStock: 1,
				active: true,
				type: product.type,
				trackStock: true,
			};
			if (product.id) {
				await tx.product.upsert({
					where: { id: product.id },
					create: { id: product.id, ...data },
					update: data,
				});
			} else {
				const existingProduct = await tx.product.findFirst({
					where: { barbershopId: PERF_BARBERSHOP_ID, name: product.name },
				});
				if (existingProduct) {
					await tx.product.update({ where: { id: existingProduct.id }, data });
				} else {
					await tx.product.create({ data });
				}
			}
		}

		await tx.user.upsert({
			where: { email: PERF_OWNER_EMAIL },
			create: {
				name: "Dono Fixture Perf",
				email: PERF_OWNER_EMAIL,
				password: ownerPassword,
				role: "OWNER",
				barbershopId: PERF_BARBERSHOP_ID,
				emailVerified: true,
				active: true,
			},
			update: {
				barbershopId: PERF_BARBERSHOP_ID,
				role: "OWNER",
				active: true,
			},
		});
	});

	console.log(`✅ Fixture perf pronto: ${PERF_BARBERSHOP_ID} (${PERF_PRODUCT_COUNT} produtos, dono ${PERF_OWNER_EMAIL})`);
}

export async function listTestAccounts(client: any) {
	const users = await client.user.findMany({
		where: { deletedAt: null },
		select: { id: true, email: true, name: true, role: true, barbershopId: true, createdAt: true, active: true },
		orderBy: { createdAt: "asc" },
	});
	const shops = await client.barbershop.findMany({
		select: { id: true, name: true, active: true, approvalStatus: true },
		orderBy: { createdAt: "asc" },
	});

	const testUsers = users.filter((u: any) => isTestAccountEmail(u.email));
	const testShopIds = new Set(shops.filter((s: any) => isTestShopName(s.name)).map((s: any) => s.id));
	const usersInTestShops = users.filter((u: any) => u.barbershopId && testShopIds.has(u.barbershopId));
	const allTestUsers = [...testUsers, ...usersInTestShops.filter((u: any) => !testUsers.includes(u))];

	console.log("— Contas de teste (leitura; nada foi apagado) —");
	for (const u of allTestUsers) {
		console.log(`  user  ${u.email.padEnd(42)} role=${String(u.role).padEnd(12)} shop=${u.barbershopId ?? "-"} active=${u.active} id=${u.id}`);
	}
	console.log("— Salões de teste —");
	for (const s of shops.filter((s: any) => isTestShopName(s.name))) {
		console.log(`  shop  ${s.name.padEnd(42)} id=${s.id} active=${s.active} approval=${s.approvalStatus}`);
	}
	console.log(`Total: ${allTestUsers.length} conta(s), ${shops.filter((s: any) => isTestShopName(s.name)).length} salão(ões).`);
	return { users: allTestUsers, shops: shops.filter((s: any) => isTestShopName(s.name)) };
}

export async function purgePerfFixture(client: any, confirm: boolean) {
	const shop = await client.barbershop.findUnique({ where: { id: PERF_BARBERSHOP_ID } });
	const owners = await client.user.findMany({
		where: { barbershopId: PERF_BARBERSHOP_ID },
		select: { id: true, email: true },
	});
	const productCount = await client.product.count({ where: { barbershopId: PERF_BARBERSHOP_ID } });

	console.log("— Purge do fixture perf (NADA é apagado sem --confirm) —");
	console.log(`  salão ${PERF_BARBERSHOP_ID} ${shop ? `"${shop.name}"` : "(inexistente)"}`);
	console.log(`  ${owners.length} usuário(s) vinculado(s): ${owners.map((o: any) => o.email).join(", ") || "-"}`);
	console.log(`  ${productCount} produto(s) (apagados em cascata com o salão)`);

	if (!confirm) {
		console.log("DRY-RUN: adicione --confirm para apagar de fato (somente local/teste).");
		return { purged: false };
	}
	if (looksLikeProductionEnvironment()) {
		throw new Error("Purge bloqueado em ambiente de produção");
	}

	await client.$transaction(async (tx: any) => {
		await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${PERF_BARBERSHOP_ID}, TRUE)`;
		if (shop) {
			await tx.barbershop.delete({ where: { id: PERF_BARBERSHOP_ID } });
		}
		// Usuários do tenant já caem em cascata pelo FK; sobra só quem era de outro tenant.
	});
	console.log("✅ Fixture perf removido (salão, produtos, usuários do tenant).");
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
	return typeof entry === "string" && /seed-perf-fixture\.(ts|js|mts|cts|mjs)$/.test(entry);
}

async function main() {
	const args = parsePerfFixtureArgs(process.argv.slice(2));
	const client = createClient();
	const hashProvider = new BcryptHashProvider();
	try {
		if (args.listAccounts) {
			await listTestAccounts(client);
		} else if (args.purge) {
			await purgePerfFixture(client, args.confirm);
		} else {
			await seedPerfFixture(client, hashProvider);
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
