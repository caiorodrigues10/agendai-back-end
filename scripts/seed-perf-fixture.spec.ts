/// <reference types="vitest/globals" />
import { createFakeSeedDb } from "../src/tests/helpers/fakeSeedDb";
import {
	DEFAULT_PERF_OWNER_PASSWORD,
	PERF_BARBERSHOP_ID,
	PERF_BARBERSHOP_NAME,
	PERF_FIRST_PRODUCT_ID,
	PERF_PRODUCT_COUNT,
	buildPerfProducts,
	isTestAccountEmail,
	isTestShopName,
	listTestAccounts,
	parsePerfFixtureArgs,
	purgePerfFixture,
	seedPerfFixture,
} from "./seed-perf-fixture";

const fakeHash = { hash: async (value: string) => `hashed:${value}` } as any;

let savedEnv: Record<string, string | undefined>;

describe("scripts/seed-perf-fixture", () => {
	beforeEach(() => {
		savedEnv = { NODE_ENV: process.env.NODE_ENV, SEED_PERF_OWNER_PASSWORD: process.env.SEED_PERF_OWNER_PASSWORD };
		delete process.env.NODE_ENV;
		delete process.env.SEED_PERF_OWNER_PASSWORD;
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		for (const [k, v] of Object.entries(savedEnv)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		vi.restoreAllMocks();
	});

	describe("parsePerfFixtureArgs", () => {
		it("flags vazias = seed", () => {
			expect(parsePerfFixtureArgs([])).toEqual({ listAccounts: false, purge: false, confirm: false });
		});

		it("reconhece list-accounts, purge e confirm", () => {
			expect(parsePerfFixtureArgs(["--purge", "--confirm"])).toEqual({
				listAccounts: false,
				purge: true,
				confirm: true,
			});
			expect(parsePerfFixtureArgs(["--list-accounts"]).listAccounts).toBe(true);
		});

		it("--confirm sem --purge é erro; argumento desconhecido é erro", () => {
			expect(() => parsePerfFixtureArgs(["--confirm"])).toThrow(/--purge/);
			expect(() => parsePerfFixtureArgs(["--nope"])).toThrow(/desconhecido/);
		});
	});

	describe("classificação de contas/salões de teste", () => {
		it("detecta e-mails de teste e rejeita reais", () => {
			expect(isTestAccountEmail("e2e.owner.1@agendai.local")).toBe(true);
			expect(isTestAccountEmail("perf.owner@agendai.local")).toBe(true);
			expect(isTestAccountEmail("dono.smoke@teste.dev")).toBe(true);
			expect(isTestAccountEmail("admin@admin.com")).toBe(false);
			expect(isTestAccountEmail("cliente@salao.com.br")).toBe(false);
		});

		it("detecta nomes de salão de teste", () => {
			expect(isTestShopName("E2E Convite 123")).toBe(true);
			expect(isTestShopName("Smoke Convite Teste")).toBe(true);
			expect(isTestShopName(PERF_BARBERSHOP_NAME)).toBe(true);
			expect(isTestShopName("Barbearia do Zé")).toBe(false);
		});
	});

	describe("buildPerfProducts", () => {
		it("gera 30 produtos com UUID fixo só no primeiro e nomes estáveis", () => {
			const products = buildPerfProducts();
			expect(products).toHaveLength(PERF_PRODUCT_COUNT);
			expect(products[0].id).toBe(PERF_FIRST_PRODUCT_ID);
			expect(products[1].id).toBeUndefined();
			expect(products[0].name).toBe("Produto Sintetico 01");
			expect(products[29].name).toBe("Produto Sintetico 30");
			expect(products.every(p => p.salePrice > 0)).toBe(true);
		});
	});

	describe("seedPerfFixture (idempotência)", () => {
		it("duas execuções não duplicam salão, produtos, dono nem defaults", async () => {
			const { db } = createFakeSeedDb();
			await seedPerfFixture(db, fakeHash);
			await seedPerfFixture(db, fakeHash);

			expect(db.barbershop.rows).toHaveLength(1);
			expect(db.barbershop.rows[0].id).toBe(PERF_BARBERSHOP_ID);
			expect(db.barbershop.rows[0].name).toBe(PERF_BARBERSHOP_NAME);
			expect(db.user.rows.filter((u: any) => u.email === "perf.owner@agendai.local")).toHaveLength(1);
			expect(db.user.rows.find((u: any) => u.email === "perf.owner@agendai.local").password).toBe(
				`hashed:${DEFAULT_PERF_OWNER_PASSWORD}`,
			);
			// 30 produtos: primeiro por UUID fixo, demais por nome.
			expect(db.product.rows).toHaveLength(PERF_PRODUCT_COUNT);
			expect(db.product.rows.filter((p: any) => p.id === PERF_FIRST_PRODUCT_ID)).toHaveLength(1);
			// defaults do tenant (schedule 7 dias, serviços, categorias…) não duplicam
			expect(db.schedule.rows).toHaveLength(7);
			expect(db.service.rows.filter((s: any) => s.name === "Corte")).toHaveLength(1);
		});

		it("recusa produção", async () => {
			const { db } = createFakeSeedDb();
			process.env.NODE_ENV = "production";
			await expect(seedPerfFixture(db, fakeHash)).rejects.toThrow(/produção/);
		});

		it("renova o trial expirado do fixture para agora (createdAt + endDate da assinatura)", async () => {
			const { db } = createFakeSeedDb();
			const now = new Date();
			const expiredShopDate = new Date(now.getTime() - 60 * 86_400_000);
			const expiredTrialEnd = new Date(now.getTime() - 40 * 86_400_000);
			await db.barbershop.create({ data: { id: PERF_BARBERSHOP_ID, name: PERF_BARBERSHOP_NAME, createdAt: expiredShopDate } });
			await db.subscription.create({
				data: { barbershopId: PERF_BARBERSHOP_ID, status: "TRIALING", endDate: expiredTrialEnd },
			});

			await seedPerfFixture(db, fakeHash);

			const shop: any = db.barbershop.rows.find((r: any) => r.id === PERF_BARBERSHOP_ID);
			const sub: any = db.subscription.rows.find((r: any) => r.barbershopId === PERF_BARBERSHOP_ID);
			const daysSince = (d: Date) => (Date.now() - new Date(d).getTime()) / 86_400_000;
			expect(daysSince(shop.createdAt)).toBeLessThan(1);
			expect(daysSince(sub.endDate)).toBeLessThan(0); // endDate ainda no futuro
			expect(sub.status).toBe("TRIALING");
		});

		it("não mexe no trial quando o fixture ainda está dentro do período", async () => {
			const { db } = createFakeSeedDb();
			const activeShopDate = new Date(Date.now() - 2 * 86_400_000);
			const activeTrialEnd = new Date(Date.now() + 28 * 86_400_000);
			await db.barbershop.create({ data: { id: PERF_BARBERSHOP_ID, name: PERF_BARBERSHOP_NAME, createdAt: activeShopDate } });
			await db.subscription.create({
				data: { barbershopId: PERF_BARBERSHOP_ID, status: "TRIALING", endDate: activeTrialEnd },
			});

			await seedPerfFixture(db, fakeHash);

			const shop: any = db.barbershop.rows.find((r: any) => r.id === PERF_BARBERSHOP_ID);
			const sub: any = db.subscription.rows.find((r: any) => r.barbershopId === PERF_BARBERSHOP_ID);
			expect(shop.createdAt).toEqual(activeShopDate);
			expect(sub.endDate).toEqual(activeTrialEnd);
		});

		it("recusa se o UUID já pertence a outro salão", async () => {
			const { db } = createFakeSeedDb();
			await db.barbershop.create({ data: { id: PERF_BARBERSHOP_ID, name: "Outro Salão" } });
			await expect(seedPerfFixture(db, fakeHash)).rejects.toThrow(/outro salão/);
		});
	});

	describe("listTestAccounts (leitura)", () => {
		it("lista apenas contas/salões de teste e não altera nada", async () => {
			const { db } = createFakeSeedDb();
			await db.user.create({ data: { email: "e2e.owner.1@agendai.local", role: "OWNER", barbershopId: null } });
			await db.user.create({ data: { email: "cliente@salao.com.br", role: "CLIENT", barbershopId: null } });
			await db.barbershop.create({ data: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "E2E Convite 1" } });

			const result = await listTestAccounts(db);
			expect(result.users.map((u: any) => u.email)).toEqual(["e2e.owner.1@agendai.local"]);
			expect(result.shops).toHaveLength(1);
			expect(db.user.rows).toHaveLength(2); // nada apagado
		});
	});

	describe("purgePerfFixture", () => {
		it("sem --confirm é dry-run e não apaga", async () => {
			const { db } = createFakeSeedDb();
			await seedPerfFixture(db, fakeHash);
			const result = await purgePerfFixture(db, false);
			expect(result.purged).toBe(false);
			expect(db.barbershop.rows).toHaveLength(1);
		});

		it("com --confirm apaga o salão fixture", async () => {
			const { db } = createFakeSeedDb();
			await seedPerfFixture(db, fakeHash);
			const result = await purgePerfFixture(db, true);
			expect(result.purged).toBe(true);
			expect(db.barbershop.rows).toHaveLength(0);
		});

		it("com --confirm em produção é erro", async () => {
			const { db } = createFakeSeedDb();
			await seedPerfFixture(db, fakeHash);
			process.env.NODE_ENV = "production";
			await expect(purgePerfFixture(db, true)).rejects.toThrow(/produção/);
		});
	});
});
