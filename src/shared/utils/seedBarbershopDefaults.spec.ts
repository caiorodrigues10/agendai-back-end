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

    // Categorias de serviço (BARBERSHOP)
    expect(db.serviceCategory.rows).toHaveLength(2);
    const cortes = db.serviceCategory.rows.find((r: any) => r.name === "Cortes");
    const barba = db.serviceCategory.rows.find((r: any) => r.name === "Barba");
    expect(cortes.icon).toBe("scissors");
    expect(barba.icon).toBe("user");
    expect(db.serviceCategory.rows.every((r: any) => r.barbershopId === SHOP)).toBe(true);

    // Serviços vinculados às categorias — catálogo completo de barbearia
    const serviceNames = db.service.rows.map((r: any) => r.name);
    expect(serviceNames).toEqual(
      expect.arrayContaining(["Corte", "Barba", "Corte + barba", "Sobrancelha", "Pigmentação de barba"]),
    );
    expect(db.service.rows).toHaveLength(5);
    const corte = db.service.rows.find((r: any) => r.name === "Corte");
    const barbaSvc = db.service.rows.find((r: any) => r.name === "Barba");
    expect(corte.price).toBe(45);
    expect(corte.avgTimeMinutes).toBe(30);
    expect(barbaSvc.icon).toBe("user");
    expect(corte.categoryId).toBe(cortes.id);
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

    // Preferências de notificação WHATSAPP (9 tipos configuráveis pelo dono)
    expect(db.notificationPreference.rows).toHaveLength(9);
    expect(
      db.notificationPreference.rows.every(
        (r: any) => r.channel === "WHATSAPP" && r.enabled === true,
      ),
    ).toBe(true);
  });

  it("LAW_FIRM usa o catálogo de advocacia e não semeia marketing/fidelidade/promocional", async () => {
    const { db } = createFakeSeedDb();

    await seedBarbershopDefaults(db, SHOP, "LAW_FIRM");

    // Catálogo de advocacia: Consultoria e Contencioso
    const categoryNames = db.serviceCategory.rows.map((r: any) => r.name);
    expect(categoryNames).toEqual(expect.arrayContaining(["Consultoria", "Contencioso"]));
    expect(categoryNames).not.toContain("Cortes");

    const serviceNames = db.service.rows.map((r: any) => r.name);
    expect(serviceNames).toEqual(
      expect.arrayContaining(["Consulta inicial", "Acompanhamento de processo"]),
    );
    expect(serviceNames).not.toContain("Barba");

    // Horário do escritório: segunda a sexta (fim de semana fechado)
    expect(db.schedule.rows).toHaveLength(7);
    const openDays = db.schedule.rows.filter((r: any) => r.isOpen).map((r: any) => r.dayOfWeek);
    expect(openDays).toEqual([1, 2, 3, 4, 5]);

    // Sem despesa de marketing
    const expenseNames = db.expenseCategory.rows.map((r: any) => r.name);
    expect(expenseNames).toEqual(expect.arrayContaining(["Aluguel", "Salários"]));
    expect(expenseNames).not.toContain("Marketing");

    // Fidelidade nasce inativa
    expect(db.loyaltyProgram.rows[0].isActive).toBe(false);

    // Notificações promocionais desligadas
    const disabled = db.notificationPreference.rows
      .filter((r: any) => r.enabled === false)
      .map((r: any) => r.type);
    expect(disabled).toContain("NPS_SURVEY");
    expect(
      db.notificationPreference.rows.filter(
        (r: any) => r.type === "APPOINTMENT_REMINDER" && r.enabled === true,
      ),
    ).toHaveLength(1);
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
    expect(db.notificationPreference.rows).toHaveLength(9);
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

    await seedBarbershopDefaults(db, SHOP, undefined, schedule);

    expect(db.schedule.rows).toHaveLength(7);
    expect(db.schedule.rows.find((r: any) => r.dayOfWeek === 1).isOpen).toBe(false);
    expect(db.schedule.rows.find((r: any) => r.dayOfWeek === 2).openTime).toBe("08:00");
  });

  describe("catálogo por segmento", () => {
    it("PETSHOP semeia banho, tosa e cuidados", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, "PETSHOP");

      const names = db.service.rows.map((r: any) => r.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "Banho",
          "Tosa higiênica",
          "Tosa completa",
          "Banho + tosa",
          "Hidratação de pelagem",
          "Corte de unhas",
          "Limpeza de ouvidos",
        ]),
      );
      const categories = db.serviceCategory.rows.map((r: any) => r.name);
      expect(categories).toEqual(expect.arrayContaining(["Banho", "Tosa", "Cuidados"]));

      // Categorias de produto do petshop, não as de barbearia
      const productCategories = db.productCategory.rows.map((r: any) => r.name);
      expect(productCategories).toEqual(expect.arrayContaining(["Higiene pet", "Tosa e cuidados"]));
      expect(productCategories).not.toContain("Finalizadores");

      // Petshop abre 08:00 e trabalha sábado
      const saturday = db.schedule.rows.find((r: any) => r.dayOfWeek === 6);
      expect(saturday.isOpen).toBe(true);
      expect(saturday.openTime).toBe("08:00");
    });

    it("CABELEREIRO semeia corte, coloração e tratamento", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, "HAIR_SALON");

      const names = db.service.rows.map((r: any) => r.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "Corte feminino",
          "Corte masculino",
          "Escova",
          "Coloração",
          "Mechas",
          "Hidratação",
          "Progressiva",
        ]),
      );

      // Salão de cabelo fecha domingo e sábado
      const saturday = db.schedule.rows.find((r: any) => r.dayOfWeek === 6);
      expect(saturday.isOpen).toBe(false);
    });

    it("NAILS semeia manicure, alongamento e nail art", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, "NAIL_STUDIO");

      const names = db.service.rows.map((r: any) => r.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "Manicure",
          "Pedicure",
          "Esmaltação em gel",
          "Alongamento em fibra",
          "Alongamento em gel",
          "Nail art",
          "Remoção",
        ]),
      );
    });

    it("BARBEARIA semeia corte, barba, sobrancelha e pigmentação", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, "BARBERSHOP");

      const names = db.service.rows.map((r: any) => r.name);
      expect(names).toEqual(
        expect.arrayContaining(["Corte", "Barba", "Corte + barba", "Sobrancelha", "Pigmentação de barba"]),
      );
    });

    it("segmento ausente cai em BARBERSHOP, que é o default do banco", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, null);

      const names = db.service.rows.map((r: any) => r.name);
      expect(names).toEqual(expect.arrayContaining(["Corte", "Barba"]));
    });

    it("é idempotente também com segmento informado", async () => {
      const { db } = createFakeSeedDb();

      await seedBarbershopDefaults(db, SHOP, "PETSHOP");
      const first = {
        serviceCategory: db.serviceCategory.rows.length,
        service: db.service.rows.length,
        productCategory: db.productCategory.rows.length,
      };

      await seedBarbershopDefaults(db, SHOP, "PETSHOP");

      expect(db.serviceCategory.rows).toHaveLength(first.serviceCategory);
      expect(db.service.rows).toHaveLength(first.service);
      expect(db.productCategory.rows).toHaveLength(first.productCategory);
    });

    it("não sobrescreve serviço que o dono já criou com o mesmo nome", async () => {
      const { db } = createFakeSeedDb();
      db.service.rows.push({
        id: "svc-banho",
        barbershopId: SHOP,
        name: "Banho",
        price: 999,
        avgTimeMinutes: 10,
        icon: "custom",
        categoryId: null,
      });

      await seedBarbershopDefaults(db, SHOP, "PETSHOP");

      const banho = db.service.rows.find((r: any) => r.name === "Banho");
      expect(banho.price).toBe(999);
      expect(banho.avgTimeMinutes).toBe(10);
      expect(banho.icon).toBe("custom");
      expect(db.service.rows.filter((r: any) => r.name === "Banho")).toHaveLength(1);
    });
  });
});
