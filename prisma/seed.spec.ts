/// <reference types="vitest/globals" />
import { createFakeSeedDb } from "../src/tests/helpers/fakeSeedDb";
import {
  DEMO_BARBERSHOP_ID,
  DEMO_BARBERSHOP_NAME,
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_ID,
  defaultPlans,
  isDirectExecution,
  looksLikeProductionEnvironment,
  parseCliArgs,
  resolveSeedProfile,
  runSeed,
  seedDemoData,
  seedGlobalReferenceData,
  seedMasterAdmin,
  seedPlans,
  seedSystemUser,
  seedTenantDefaults,
} from "./seed";

const ENV_KEYS = [
  "SEED_DEMO",
  "SEED_PROFILE",
  "SEED_MASTER_ADMIN_EMAIL",
  "SEED_MASTER_ADMIN_PASSWORD",
  "NODE_ENV",
  "DATABASE_URL",
] as const;

const fakeHash = { hash: async (value: string) => `hashed:${value}` } as any;
const VALID_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let savedEnv: Record<string, string | undefined>;

describe("prisma/seed", () => {
  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key] as string;
    }
    vi.restoreAllMocks();
  });

  describe("isDirectExecution", () => {
    it("não roda main() quando importado (vitest)", () => {
      expect(isDirectExecution()).toBe(false);
    });
  });

  describe("resolveSeedProfile", () => {
    it("usa base como padrão", () => {
      expect(resolveSeedProfile()).toBe("base");
    });

    it("lê SEED_PROFILE do ambiente", () => {
      process.env.SEED_PROFILE = "demo";
      expect(resolveSeedProfile()).toBe("demo");
    });

    it("prefere o perfil do CLI sobre o ambiente", () => {
      process.env.SEED_PROFILE = "demo";
      expect(resolveSeedProfile("all")).toBe("all");
    });

    it("rejeita perfil inválido", () => {
      expect(() => resolveSeedProfile("banana")).toThrow(/SEED_PROFILE inválido/);
      process.env.SEED_PROFILE = "banana";
      expect(() => resolveSeedProfile()).toThrow(/SEED_PROFILE inválido/);
    });
  });

  describe("parseCliArgs", () => {
    it("sem argumentos retorna perfil indefinido e tenant false", () => {
      expect(parseCliArgs([])).toEqual({ tenant: false });
    });

    it("aceita --profile, --demo, --tenant e --barbershopId", () => {
      expect(parseCliArgs(["--profile=all"])).toEqual({ profile: "all", tenant: false });
      expect(parseCliArgs(["--demo"])).toEqual({ profile: "demo", tenant: false });
      expect(parseCliArgs(["--tenant", `--barbershopId=${VALID_UUID}`])).toEqual({
        tenant: true,
        barbershopId: VALID_UUID,
      });
    });

    it("--tenant exige --barbershopId", () => {
      expect(() => parseCliArgs(["--tenant"])).toThrow(/exige --barbershopId/);
    });

    it("--barbershopId sem --tenant é rejeitado", () => {
      expect(() => parseCliArgs([`--barbershopId=${VALID_UUID}`])).toThrow(/--tenant/);
    });

    it("argumento desconhecido é rejeitado", () => {
      expect(() => parseCliArgs(["--frobnicate"])).toThrow(/desconhecido/);
    });
  });

  describe("looksLikeProductionEnvironment", () => {
    it("detecta NODE_ENV=production", () => {
      expect(looksLikeProductionEnvironment({ NODE_ENV: "production" } as any, "")).toBe(true);
    });

    it("detecta nome de banco com 'prod'", () => {
      expect(
        looksLikeProductionEnvironment(
          {} as any,
          "postgresql://user:pass@db.example.com:5432/agendai_prod",
        ),
      ).toBe(true);
    });

    it("detecta hostname com 'prod'", () => {
      expect(
        looksLikeProductionEnvironment(
          {} as any,
          "postgresql://user:pass@prod-db.example.com:5432/agendai",
        ),
      ).toBe(true);
    });

    it("ambiente normal não é produção", () => {
      expect(
        looksLikeProductionEnvironment(
          { NODE_ENV: "development" } as any,
          "postgresql://user:pass@localhost:5432/agendai_db",
        ),
      ).toBe(false);
    });

    it("URL inválida não é produção", () => {
      expect(looksLikeProductionEnvironment({ NODE_ENV: "test" } as any, "nope")).toBe(false);
    });
  });

  describe("seedSystemUser", () => {
    it("cria o usuário-sistema com id fixo na primeira execução", async () => {
      const { db } = createFakeSeedDb();
      await seedSystemUser(db, fakeHash);

      const systemUser = db.user.rows.find((r: any) => r.id === SYSTEM_USER_ID);
      expect(systemUser).toBeTruthy();
      expect(systemUser.email).toBe(SYSTEM_USER_EMAIL);
      expect(systemUser.role).toBe("MASTER_ADMIN");
      expect(systemUser.active).toBe(false);
      expect(systemUser.password).toMatch(/^hashed:/);
    });

    it("não duplica em segunda execução", async () => {
      const { db } = createFakeSeedDb();
      await seedSystemUser(db, fakeHash);
      await seedSystemUser(db, fakeHash);
      expect(db.user.rows).toHaveLength(1);
    });

    it("não duplica se o e-mail já existir sob outro id", async () => {
      const { db } = createFakeSeedDb();
      db.user.rows.push({ id: "other-id", email: SYSTEM_USER_EMAIL });
      await seedSystemUser(db, fakeHash);
      expect(db.user.rows).toHaveLength(1);
      expect(db.user.rows[0].id).toBe("other-id");
    });
  });

  describe("seedPlans", () => {
    it("cria os 4 planos padrão e desativa legados", async () => {
      const { db } = createFakeSeedDb();
      db.plan.rows.push({ id: "legacy-1", name: "Mensal", active: true });
      db.plan.rows.push({ id: "legacy-2", name: "Anual", active: true });

      await seedPlans(db);

      for (const plan of defaultPlans) {
        expect(db.plan.rows.find((r: any) => r.name === plan.name)).toBeTruthy();
      }
      expect(db.plan.rows.find((r: any) => r.id === "legacy-1").active).toBe(false);
      expect(db.plan.rows.find((r: any) => r.id === "legacy-2").active).toBe(false);
      expect(db.plan.rows.filter((r: any) => r.name === "Essencial")).toHaveLength(1);
    });

    it("segunda execução atualiza em vez de duplicar", async () => {
      const { db } = createFakeSeedDb();
      await seedPlans(db);
      const countAfterFirst = db.plan.rows.length;
      const essencial = db.plan.rows.find((r: any) => r.name === "Essencial");
      essencial.price = 999;

      await seedPlans(db);

      expect(db.plan.rows).toHaveLength(countAfterFirst);
      expect(db.plan.rows.find((r: any) => r.name === "Essencial").price).toBe(14);
      expect(db.plan.rows.find((r: any) => r.name === "Essencial").active).toBe(true);
    });
  });

  describe("seedMasterAdmin", () => {
    it("ignora quando envs não estão definidas", async () => {
      const { db } = createFakeSeedDb();
      await seedMasterAdmin(db, fakeHash);
      expect(db.user.rows).toHaveLength(0);
    });

    it("cria o admin quando envs estão definidas", async () => {
      process.env.SEED_MASTER_ADMIN_EMAIL = "boss@agendai.local";
      process.env.SEED_MASTER_ADMIN_PASSWORD = "s3nh4-forte";
      const { db } = createFakeSeedDb();

      await seedMasterAdmin(db, fakeHash);

      const admin = db.user.rows.find((r: any) => r.email === "boss@agendai.local");
      expect(admin).toBeTruthy();
      expect(admin.role).toBe("MASTER_ADMIN");
      expect(admin.active).toBe(true);
      expect(admin.password).toBe("hashed:s3nh4-forte");
    });

    it("ignora em produção mesmo com envs definidas", async () => {
      process.env.SEED_MASTER_ADMIN_EMAIL = "boss@agendai.local";
      process.env.SEED_MASTER_ADMIN_PASSWORD = "s3nh4-forte";
      process.env.NODE_ENV = "production";
      const { db } = createFakeSeedDb();

      await seedMasterAdmin(db, fakeHash);
      expect(db.user.rows).toHaveLength(0);
    });

    it("não duplica admin existente", async () => {
      process.env.SEED_MASTER_ADMIN_EMAIL = "boss@agendai.local";
      process.env.SEED_MASTER_ADMIN_PASSWORD = "s3nh4-forte";
      const { db } = createFakeSeedDb();
      db.user.rows.push({ id: "u1", email: "boss@agendai.local" });

      await seedMasterAdmin(db, fakeHash);
      expect(db.user.rows).toHaveLength(1);
    });
  });

  describe("seedGlobalReferenceData", () => {
    it("cria categorias globais (barbershopId null) uma única vez", async () => {
      const { db } = createFakeSeedDb();
      await seedGlobalReferenceData(db);
      await seedGlobalReferenceData(db);

      const serviceCats = db.serviceCategory.rows.filter((r: any) => r.barbershopId === null);
      const expenseCats = db.expenseCategory.rows.filter((r: any) => r.barbershopId === null);
      expect(serviceCats).toHaveLength(1);
      expect(serviceCats[0].name).toBe("Serviços");
      expect(expenseCats).toHaveLength(1);
      expect(expenseCats[0].name).toBe("Compra de estoque");
    });
  });

  describe("seedDemoData", () => {
    it("exige SEED_DEMO=true", async () => {
      const { db } = createFakeSeedDb();
      await expect(seedDemoData(db)).rejects.toThrow(/SEED_DEMO=true/);
    });

    it("bloqueia NODE_ENV=production", async () => {
      process.env.SEED_DEMO = "true";
      process.env.NODE_ENV = "production";
      const { db } = createFakeSeedDb();
      await expect(seedDemoData(db)).rejects.toThrow(/produção/);
    });

    it("bloqueia banco que parece produção", async () => {
      process.env.SEED_DEMO = "true";
      process.env.DATABASE_URL = "postgresql://user:pass@host:5432/agendai_prod";
      const { db } = createFakeSeedDb();
      await expect(seedDemoData(db)).rejects.toThrow(/produção/);
    });

    it("aborta se o UUID do demo pertence a outro salão", async () => {
      process.env.SEED_DEMO = "true";
      const { db } = createFakeSeedDb();
      db.barbershop.rows.push({ id: DEMO_BARBERSHOP_ID, name: "Outro Salão" });
      await expect(seedDemoData(db)).rejects.toThrow(/pertence a outro salão/);
    });

    it("cria o salão demo com defaults completos", async () => {
      process.env.SEED_DEMO = "true";
      const { db } = createFakeSeedDb();

      await seedDemoData(db);

      const shop = db.barbershop.rows.find((r: any) => r.id === DEMO_BARBERSHOP_ID);
      expect(shop.name).toBe(DEMO_BARBERSHOP_NAME);
      expect(shop.approvalStatus).toBe("APPROVED");
      expect(shop.active).toBe(true);
      expect(db.schedule.rows).toHaveLength(7);
      expect(db.service.rows).toHaveLength(3);
      expect(db.loyaltyProgram.rows).toHaveLength(1);
      expect(db.notificationPreference.rows).toHaveLength(8);
      expect(db.appointmentPolicy.rows).toHaveLength(1);
      expect(db.barbershopEmailSettings.rows).toHaveLength(1);
      expect(db.profitSettings.rows).toHaveLength(1);
    });

    it("segunda execução é idempotente", async () => {
      process.env.SEED_DEMO = "true";
      const { db } = createFakeSeedDb();
      await seedDemoData(db);
      await seedDemoData(db);

      expect(db.barbershop.rows).toHaveLength(1);
      expect(db.schedule.rows).toHaveLength(7);
      expect(db.service.rows).toHaveLength(3);
      expect(db.serviceCategory.rows).toHaveLength(2);
      expect(db.loyaltyProgram.rows).toHaveLength(1);
    });
  });

  describe("seedTenantDefaults", () => {
    it("rejeita uuid inválido", async () => {
      const { db } = createFakeSeedDb();
      await expect(seedTenantDefaults(db, "nao-e-uuid")).rejects.toThrow(/inválido/);
    });

    it("rejeita barbearia inexistente", async () => {
      const { db } = createFakeSeedDb();
      await expect(seedTenantDefaults(db, VALID_UUID)).rejects.toThrow(/não encontrada/);
    });

    it("aplica defaults na barbearia existente", async () => {
      const { db, rawValues } = createFakeSeedDb();
      db.barbershop.rows.push({ id: VALID_UUID, name: "Salão Existente" });

      await seedTenantDefaults(db, VALID_UUID);

      expect(db.schedule.rows).toHaveLength(7);
      expect(db.service.rows).toHaveLength(3);
      expect(db.notificationPreference.rows).toHaveLength(8);
      expect(rawValues[0][0]).toBe(VALID_UUID);
    });
  });

  describe("runSeed", () => {
    it("perfil base roda system user, planos, master admin e dados globais", async () => {
      const { db } = createFakeSeedDb();
      await runSeed(db, fakeHash, { profile: "base", tenant: false });

      expect(db.user.rows.find((r: any) => r.id === SYSTEM_USER_ID)).toBeTruthy();
      expect(db.plan.rows).toHaveLength(defaultPlans.length);
      expect(
        db.serviceCategory.rows.find((r: any) => r.barbershopId === null && r.name === "Serviços"),
      ).toBeTruthy();
      expect(db.barbershop.rows).toHaveLength(0);
    });

    it("perfil base é idempotente", async () => {
      const { db } = createFakeSeedDb();
      await runSeed(db, fakeHash, { profile: "base", tenant: false });
      await runSeed(db, fakeHash, { profile: "base", tenant: false });

      expect(db.user.rows).toHaveLength(1);
      expect(db.plan.rows).toHaveLength(defaultPlans.length);
      expect(db.serviceCategory.rows.filter((r: any) => r.barbershopId === null)).toHaveLength(1);
    });

    it("perfil demo exige SEED_DEMO=true e cria o salão", async () => {
      const { db } = createFakeSeedDb();
      await expect(runSeed(db, fakeHash, { profile: "demo", tenant: false })).rejects.toThrow(
        /SEED_DEMO=true/,
      );
      expect(db.barbershop.rows).toHaveLength(0);

      process.env.SEED_DEMO = "true";
      await runSeed(db, fakeHash, { profile: "demo", tenant: false });
      expect(db.barbershop.rows.find((r: any) => r.id === DEMO_BARBERSHOP_ID)).toBeTruthy();
      expect(db.user.rows).toHaveLength(0);
    });

    it("modo tenant roda apenas os defaults do salão informado", async () => {
      const { db } = createFakeSeedDb();
      db.barbershop.rows.push({ id: VALID_UUID, name: "Salão Existente" });

      await runSeed(db, fakeHash, { tenant: true, barbershopId: VALID_UUID });

      expect(db.schedule.rows).toHaveLength(7);
      expect(db.user.rows).toHaveLength(0);
      expect(db.plan.rows).toHaveLength(0);
      expect(db.barbershop.rows).toHaveLength(1);
    });
  });
});
