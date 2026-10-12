/// <reference types="vitest/globals" />
import { createFakeSeedDb } from "../src/tests/helpers/fakeSeedDb";
import {
	DEFAULT_QA_PASSWORD,
	QA_CLIENT_NAME,
	QA_EMPLOYEE_EMAIL,
	QA_OWNER_EMAIL,
	QA_SHOP_ID,
	QA_SHOP_NAME,
	listQaFixture,
	parseQaFixtureArgs,
	purgeQaFixture,
	seedQaFixture,
} from "./seed-qa-fixture";

const fakeHash = { hash: async (value: string) => `hashed:${value}` } as any;

let savedEnv: Record<string, string | undefined>;

describe("scripts/seed-qa-fixture", () => {
	beforeEach(() => {
		savedEnv = { NODE_ENV: process.env.NODE_ENV, SEED_QA_OWNER_PASSWORD: process.env.SEED_QA_OWNER_PASSWORD };
		delete process.env.NODE_ENV;
		delete process.env.SEED_QA_OWNER_PASSWORD;
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		for (const [k, v] of Object.entries(savedEnv)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		vi.restoreAllMocks();
	});

	it("parse aceita list/purge/confirm e rejeita --confirm solto", () => {
		expect(parseQaFixtureArgs([])).toEqual({ list: false, purge: false, confirm: false });
		expect(parseQaFixtureArgs(["--purge", "--confirm"])).toEqual({ list: false, purge: true, confirm: true });
		expect(() => parseQaFixtureArgs(["--confirm"])).toThrow(/--purge/);
		expect(() => parseQaFixtureArgs(["--x"])).toThrow(/desconhecido/);
	});

	it("cria salão ACTIVE + dono + funcionário + cliente e é idempotente", async () => {
		const { db } = createFakeSeedDb();
		db.plan.create({ data: { id: "plan-essencial", name: "Essencial", price: 14, active: true } });

		const first = await seedQaFixture(db, fakeHash);
		const second = await seedQaFixture(db, fakeHash);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(db.barbershop.rows).toHaveLength(1);
		expect(db.barbershop.rows[0].name).toBe(QA_SHOP_NAME);
		expect(db.user.rows.filter((u: any) => u.email === QA_OWNER_EMAIL)).toHaveLength(1);
		expect(db.user.rows.filter((u: any) => u.email === QA_EMPLOYEE_EMAIL)).toHaveLength(1);
		expect(db.user.rows.find((u: any) => u.email === QA_OWNER_EMAIL).role).toBe("OWNER");
		expect(db.user.rows.find((u: any) => u.email === QA_EMPLOYEE_EMAIL).role).toBe("EMPLOYEE");
		expect(db.user.rows.find((u: any) => u.email === QA_OWNER_EMAIL).password).toBe(
			`hashed:${DEFAULT_QA_PASSWORD}`,
		);
		expect(db.salonClient.rows.filter((c: any) => c.name === QA_CLIENT_NAME)).toHaveLength(1);
		expect(db.subscription.rows).toHaveLength(1);
		expect(db.subscription.rows[0].status).toBe("ACTIVE");
	});

	it("recusa produção", async () => {
		const { db } = createFakeSeedDb();
		process.env.NODE_ENV = "production";
		await expect(seedQaFixture(db, fakeHash)).rejects.toThrow(/produção/);
	});

	it("recusa se o UUID já pertence a outro salão", async () => {
		const { db } = createFakeSeedDb();
		await db.barbershop.create({ data: { id: QA_SHOP_ID, name: "Outro Salão" } });
		await expect(seedQaFixture(db, fakeHash)).rejects.toThrow(/outro salão/);
	});

	it("list só lê; purge sem --confirm é dry-run", async () => {
		const { db } = createFakeSeedDb();
		db.plan.create({ data: { id: "plan-essencial", name: "Essencial", price: 14, active: true } });
		await seedQaFixture(db, fakeHash);

		const listed = await listQaFixture(db);
		expect(listed.shop?.name).toBe(QA_SHOP_NAME);
		expect(db.barbershop.rows).toHaveLength(1);

		const dry = await purgeQaFixture(db, false);
		expect(dry.purged).toBe(false);
		expect(db.barbershop.rows).toHaveLength(1);

		const purged = await purgeQaFixture(db, true);
		expect(purged.purged).toBe(true);
		expect(db.barbershop.rows).toHaveLength(0);
	});
});
