/// <reference types="vitest/globals" />
import { seedBarbershopDefaults } from "./seedBarbershopDefaults";
import { createFakeSeedDb } from "../../tests/helpers/fakeSeedDb";

const SHOP = "10000000-0000-4000-8000-000000000001";

describe("seedBarbershopDefaults", () => {
  it("primeira execução cria todos os defaults do salão", async () => {
    const { db, rawValues } = createFakeSeedDb();

    await seedBarbershopDefaults(db, SHOP);

    // RLS: set_config transaction-local com o UUID do salão
    expect(rawValues).toHaveLength(1);
    expect(rawValues[0][0]).toBe(SHOP);

    // Schedule: 7 dias, domingo fechado, 09:00–19:00
    expect(db.schedule.rows).toHaveLength(7);
    const sunday = db.schedule.rows.find((r: any) => r.dayOfWeek === 0);
    const monday = db.schedule.rows.find((r: any) => r.dayOfWeek === 1);
    expect(sunday.isOpen).toBe(false);
    expect(monday.isOpen).toBe(true);
    expect(monday.openTime).toBe("09:00");
    expect(monday.closeTime).toBe("19:00");

    // Categorias de serviço
    expect(db.serviceCategory.rows).toHaveLength(2);
    const cortes = db.serviceCategory.rows.find((r: any) => r.name === "Cortes");
    const barba = db.serviceCategory.rows.find((r: any) => r.name === "Barba");
    expect(cortes.icon).toBe("scissors");
    expect(barba.icon).toBe("user");
    expect(db.serviceCategory.rows.every((r: any) => r.barbershopId === SHOP)).toBe(true);

    // Serviços vinculados às categorias
    expect(db.service.rows).toHaveLength(3);
    const corte = db.service.rows.find((r: any) => r.name === "Corte");
    const escova = db.service.rows.find((r: any) => r.name === "Escova");
    const barbaSvc = db.service.rows.find((r: any) => r.name === "Barba");
    expect(corte.price).toBe(45);
    expect(escova.avgTimeMinutes).toBe(40);
    expect(barbaSvc.icon).toBe("razor");
    expect(corte.categoryId).toBe(cortes.id);
    expect(escova.categoryId).toBe(cortes.id);
    expect(barbaSvc.categoryId).toBe(barba.id);

    // Categorias de despesa do salão
    const expenseNames = db.expenseCategory.rows.map((r: any) => r.name);
    expect(expenseNames).toEqual(
      expect.arrayContaining(["Aluguel", "Salários", "Impostos e taxas", "Marketing"]),
    );
    expect(db.expenseCategory.rows.every((r: any) => r.barbershopId === SHOP)).toBe(true);

    // Categorias de produto
    expect(db.productCategory.rows).toHaveLength(2);
    const finalizadores = db.productCategory.rows.find((r: any) => r.name === "Finalizadores");
    const higiene = db.productCategory.rows.find((r: any) => r.name === "Higiene");
    expect(finalizadores.color).toBe("#0F766E");
    expect(higiene.icon).toBe("sparkles");

    // Singletons (defaults do schema, update vazio preserva customizações)
    expect(db.appointmentPolicy.rows).toHaveLength(1);
    expect(db.appointmentPolicy.rows[0].barbershopId).toBe(SHOP);
    expect(db.barbershopEmailSettings.rows).toHaveLength(1);
    expect(db.profitSettings.rows).toHaveLength(1);

    // Fidelidade com defaults do schema de configuração
    expect(db.loyaltyProgram.rows).toHaveLength(1);
    expect(db.loyaltyProgram.rows[0].type).toBe("VISITS");
    expect(db.loyaltyProgram.rows[0].isActive).toBe(true);
    expect(db.loyaltyProgram.rows[0].config).toEqual({
      visitsRequired: 10,
      rewardDescription: "Cortesia",
      cashbackEnabled: false,
      cashbackPercent: 0,
    });

    // Preferências de notificação WHATSAPP (8 tipos configuráveis pelo dono)
    expect(db.notificationPreference.rows).toHaveLength(8);
    expect(
      db.notificationPreference.rows.every(
        (r: any) => r.channel === "WHATSAPP" && r.enabled === true,
      ),
    ).toBe(true);
  });

  it("segunda execução é idempotente (não duplica nada)", async () => {
    const { db } = createFakeSeedDb();

    await seedBarbershopDefaults(db, SHOP);
    const firstRun = {
      schedule: db.schedule.rows.length,
      serviceCategory: db.serviceCategory.rows.length,
      service: db.service.rows.length,
      expenseCategory: db.expenseCategory.rows.length,
      productCategory: db.productCategory.rows.length,
      appointmentPolicy: db.appointmentPolicy.rows.length,
      barbershopEmailSettings: db.barbershopEmailSettings.rows.length,
      profitSettings: db.profitSettings.rows.length,
      loyaltyProgram: db.loyaltyProgram.rows.length,
      notificationPreference: db.notificationPreference.rows.length,
    };

    await seedBarbershopDefaults(db, SHOP);

    expect(db.schedule.rows).toHaveLength(firstRun.schedule);
    expect(db.serviceCategory.rows).toHaveLength(firstRun.serviceCategory);
    expect(db.service.rows).toHaveLength(firstRun.service);
    expect(db.expenseCategory.rows).toHaveLength(firstRun.expenseCategory);
    expect(db.productCategory.rows).toHaveLength(firstRun.productCategory);
    expect(db.appointmentPolicy.rows).toHaveLength(firstRun.appointmentPolicy);
    expect(db.barbershopEmailSettings.rows).toHaveLength(firstRun.barbershopEmailSettings);
    expect(db.profitSettings.rows).toHaveLength(firstRun.profitSettings);
    expect(db.loyaltyProgram.rows).toHaveLength(firstRun.loyaltyProgram);
    expect(db.notificationPreference.rows).toHaveLength(firstRun.notificationPreference);
  });

  it("preserva schedule customizado existente (skipDuplicates não sobrescreve)", async () => {
    const { db } = createFakeSeedDb();
    db.schedule.rows.push({
      id: "custom-schedule",
      barbershopId: SHOP,
      dayOfWeek: 5,
      isOpen: true,
      openTime: "10:00",
      closeTime: "22:00",
    });

    await seedBarbershopDefaults(db, SHOP);

    expect(db.schedule.rows).toHaveLength(7);
    const friday = db.schedule.rows.find((r: any) => r.dayOfWeek === 5);
    expect(friday.openTime).toBe("10:00");
    expect(friday.closeTime).toBe("22:00");
    expect(friday.id).toBe("custom-schedule");
  });

  it("linka categoria em serviço existente sem categoryId e não mexe em preço", async () => {
    const { db } = createFakeSeedDb();
    db.service.rows.push({
      id: "svc-corte",
      barbershopId: SHOP,
      name: "Corte",
      price: 99,
      avgTimeMinutes: 45,
      icon: "scissors",
      categoryId: null,
    });

    await seedBarbershopDefaults(db, SHOP);

    const cortes = db.serviceCategory.rows.find((r: any) => r.name === "Cortes");
    const corte = db.service.rows.find((r: any) => r.id === "svc-corte");
    expect(corte.categoryId).toBe(cortes.id);
    expect(corte.price).toBe(99);
    // não criou um segundo "Corte"
    expect(db.service.rows.filter((r: any) => r.name === "Corte")).toHaveLength(1);
  });

  it("não sobrescreve categoryId já existente em serviço", async () => {
    const { db } = createFakeSeedDb();
    db.service.rows.push({
      id: "svc-barba",
      barbershopId: SHOP,
      name: "Barba",
      price: 30,
      avgTimeMinutes: 20,
      icon: "razor",
      categoryId: "other-category",
    });

    await seedBarbershopDefaults(db, SHOP);

    const barba = db.service.rows.find((r: any) => r.id === "svc-barba");
    expect(barba.categoryId).toBe("other-category");
  });

  it("upsert de singletons com update vazio preserva customizações", async () => {
    const { db } = createFakeSeedDb();
    db.loyaltyProgram.rows.push({
      id: "loyalty-1",
      barbershopId: SHOP,
      type: "VISITS",
      isActive: false,
      config: { visitsRequired: 5, rewardDescription: "Custom" },
    });
    db.appointmentPolicy.rows.push({
      id: "policy-1",
      barbershopId: SHOP,
      bookingNoticeMinutes: 30,
    });
    db.notificationPreference.rows.push({
      id: "pref-1",
      barbershopId: SHOP,
      channel: "WHATSAPP",
      type: "QUEUE_JOINED_CLIENT",
      enabled: false,
    });

    await seedBarbershopDefaults(db, SHOP);

    expect(db.loyaltyProgram.rows).toHaveLength(1);
    expect(db.loyaltyProgram.rows[0].isActive).toBe(false);
    expect(db.loyaltyProgram.rows[0].config.visitsRequired).toBe(5);
    expect(db.appointmentPolicy.rows).toHaveLength(1);
    expect(db.appointmentPolicy.rows[0].bookingNoticeMinutes).toBe(30);
    expect(db.notificationPreference.rows).toHaveLength(8);
    const pref = db.notificationPreference.rows.find(
      (r: any) => r.type === "QUEUE_JOINED_CLIENT",
    );
    expect(pref.enabled).toBe(false);
  });

  it("usa o schedule informado quando tem 7 dias", async () => {
    const { db } = createFakeSeedDb();
    const schedule = [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek,
      isOpen: dayOfWeek !== 0 && dayOfWeek !== 1,
      openTime: "08:00",
      closeTime: "18:00",
    }));

    await seedBarbershopDefaults(db, SHOP, schedule);

    expect(db.schedule.rows).toHaveLength(7);
    expect(db.schedule.rows.find((r: any) => r.dayOfWeek === 1).isOpen).toBe(false);
    expect(db.schedule.rows.find((r: any) => r.dayOfWeek === 2).openTime).toBe("08:00");
  });
});
