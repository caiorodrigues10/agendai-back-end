import { describe, expect, it } from "vitest";
import { getSegmentConfig } from "@/shared/segments";
import {
  buildDemoClients,
  demoAgendaPresentation,
  demoClientCount,
  demoDailyTarget,
  fakeDemoCpf,
  planDemoAppointments,
  type DemoShowcaseDensityService,
} from "./demoShowcaseDensity";
import {
  addDaysToCivilDate,
  civilDateWeekday,
  timeToMinutes,
} from "./demoShowcaseHelpers";
import type { DemoShowcaseManifestBusiness } from "./demoShowcaseAssets";

/** Data fixa para manter os testes determinísticos (miolo de novembro/2026). */
const TODAY = "2026-11-18";

const MANIFEST_IDS = [
  "barbearia",
  "cilios",
  "manicure",
  "maquiagem",
  "spa",
  "petshop",
  "fisioterapia",
  "nutricao",
  "psicologia",
  "lavajato",
  "mecanica",
  "fotografia",
  "tatuagem",
  "diarista",
  "domiciliar",
  "advocacia",
];

function businessFixture(id: string, segmento: string): DemoShowcaseManifestBusiness {
  return {
    id,
    segmento: segmento as DemoShowcaseManifestBusiness["segmento"],
    pasta: id,
    logo: "logo.png",
    banner: "banner.png",
    confirmar: true,
    extras: [],
  };
}

/** Catálogo sintético cobrindo curto/médio/longo/premium. */
const SERVICES: DemoShowcaseDensityService[] = [
  { id: "svc-30", name: "Corte rápido", price: 60, avgTimeMinutes: 30, commissionPercent: 15 },
  { id: "svc-45", name: "Corte", price: 90, avgTimeMinutes: 45, commissionPercent: 20 },
  { id: "svc-60", name: "Terapia", price: 150, avgTimeMinutes: 60, commissionPercent: 18 },
  { id: "svc-90", name: "Ritual premium", price: 260, avgTimeMinutes: 90, commissionPercent: 25 },
];

const TEST_BUSINESSES: DemoShowcaseManifestBusiness[] = [
  businessFixture("barbearia", "BARBERSHOP"),
  businessFixture("advocacia", "LAW_FIRM"),
  businessFixture("diarista", "HOME_SERVICES"),
];

/** Validador independente de CPF (algoritmo oficial: pesos 10..2 e 11..2). */
function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/gu, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/u.test(digits)) return false;
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

describe("demoShowcaseDensity — clientes", () => {
  it("demoClientCount fica na faixa 25–40 e é determinístico", () => {
    for (const id of MANIFEST_IDS) {
      const count = demoClientCount(id);
      expect(count).toBeGreaterThanOrEqual(25);
      expect(count).toBeLessThanOrEqual(40);
      expect(demoClientCount(id)).toBe(count);
    }
  });

  it("buildDemoClients gera CPF válido, telefone de 11 dígitos e IDs únicos do fixture", () => {
    const clients = buildDemoClients(businessFixture("barbearia", "BARBERSHOP"));
    expect(clients.length).toBe(demoClientCount("barbearia"));

    const ids = new Set(clients.map(client => client.id));
    const emails = new Set(clients.map(client => client.email));
    expect(ids.size).toBe(clients.length);
    expect(emails.size).toBe(clients.length);

    for (const client of clients) {
      expect(client.id.startsWith("d1a0b004-")).toBe(true); // namespace de clientes
      expect(isValidCpf(client.cpf)).toBe(true);
      expect(client.whatsapp).toMatch(/^\d{11}$/u);
      expect(client.email).toContain("@");
      expect(client.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("fakeDemoCpf é determinístico e produz CPFs verificáveis", () => {
    expect(fakeDemoCpf("demo-showcase:client:barbearia:0")).toBe(
      fakeDemoCpf("demo-showcase:client:barbearia:0"),
    );
    expect(isValidCpf(fakeDemoCpf("qualquer-chave"))).toBe(true);
    expect(isValidCpf(fakeDemoCpf("outra-chave 2"))).toBe(true);
  });
});

describe("demoShowcaseDensity — demoDailyTarget (regras do mês)", () => {
  // Hoje (2026-11-18): mês corrente = 2026-11.
  const currentMonthDay = addDaysToCivilDate(TODAY, -17); // 2026-11-01
  const previousMonthDay = addDaysToCivilDate(TODAY, -34); // 2026-10-15
  const futureMonthDay = addDaysToCivilDate(TODAY, 22); // 2026-12-10

  it("hoje e amanhã sempre no pico (6)", () => {
    expect(demoDailyTarget(0, civilDateWeekday(TODAY), TODAY)).toBe(6);
    expect(demoDailyTarget(1, civilDateWeekday(addDaysToCivilDate(TODAY, 1)), TODAY)).toBe(6);
  });

  it("mês corrente = 6, mês anterior = 1, meses antigos = 2, futuro = 5 (dia útil)", () => {
    expect(demoDailyTarget(-17, 0, TODAY)).toBe(6);
    expect(demoDailyTarget(-34, 2, TODAY)).toBe(1);
    expect(demoDailyTarget(-65, 2, TODAY)).toBe(2);
    expect(demoDailyTarget(22, 3, TODAY)).toBe(5);
    expect(currentMonthDay.slice(0, 7)).toBe("2026-11");
    expect(previousMonthDay.slice(0, 7)).toBe("2026-10");
    expect(futureMonthDay.slice(0, 7)).toBe("2026-12");
  });

  it("sábado tem metade do volume (mínimo 2)", () => {
    expect(demoDailyTarget(-17, 6, TODAY)).toBe(3); // mês corrente 6 → 3
    expect(demoDailyTarget(-34, 6, TODAY)).toBe(2); // mês anterior 1 → mínimo 2
    expect(demoDailyTarget(-65, 6, TODAY)).toBe(2); // mês antigo 2 → 2
    expect(demoDailyTarget(22, 6, TODAY)).toBe(3); // futuro 5 → 3
  });
});

describe("demoShowcaseDensity — planDemoAppointments (invariantes)", () => {
  for (const business of TEST_BUSINESSES) {
    const config = getSegmentConfig(business.segmento);
    const fixedNow = new Date("2026-11-18T15:00:00.000Z"); // 12:00 em São Paulo
    const plans = planDemoAppointments({
      business,
      today: TODAY,
      services: SERVICES,
      clientCount: 30,
      now: fixedNow,
      nowCivilTime: "12:00",
    });

    it(`${business.id}: agenda ≥ 250, determinística e dentro da faixa -60..+14`, () => {
      expect(plans.length).toBeGreaterThanOrEqual(250);
      const again = planDemoAppointments({
        business,
        today: TODAY,
        services: SERVICES,
        clientCount: 30,
        now: fixedNow,
        nowCivilTime: "12:00",
      });
      const project = (rows: typeof plans) =>
        rows.map(plan => `${plan.civilDate}|${plan.time}|${plan.staffIndex}|${plan.serviceIndex}|${plan.clientIndex}|${plan.status}`);
      expect(project(again)).toEqual(project(plans));

      for (const plan of plans) {
        expect(plan.dayOffset).toBeGreaterThanOrEqual(-60);
        expect(plan.dayOffset).toBeLessThanOrEqual(14);
        expect(plan.civilDate).toBe(addDaysToCivilDate(TODAY, plan.dayOffset));
        expect(plan.clientIndex).toBeGreaterThanOrEqual(0);
        expect(plan.clientIndex).toBeLessThan(30);
        expect(plan.finalPrice === null).toBe(plan.status !== "COMPLETED");
        expect(plan.paymentMethod === null).toBe(plan.status !== "COMPLETED");
      }
    });

    it(`${business.id}: só dias abertos, dentro do expediente e sem sobreposição`, () => {
      const blocksByStaffDay = new Map<string, Array<{ start: number; end: number }>>();

      for (const plan of plans) {
        const weekday = civilDateWeekday(plan.civilDate);
        const presetDay = config.schedulePreset[weekday];
        expect(presetDay, `${plan.civilDate} sem preset`).toBeDefined();
        expect(presetDay.isOpen, `${plan.civilDate} é dia fechado`).toBe(true);

        const open = timeToMinutes(presetDay.openTime);
        const close = timeToMinutes(presetDay.closeTime);
        const start = timeToMinutes(plan.time);
        const service = SERVICES[plan.serviceIndex];
        expect(service, "serviceIndex fora do catálogo").toBeDefined();
        const end = start + service.avgTimeMinutes;
        expect(start, `${plan.civilDate} ${plan.time} antes da abertura`).toBeGreaterThanOrEqual(open);
        expect(end, `${plan.civilDate} ${plan.time} passa do fechamento`).toBeLessThanOrEqual(close);

        const key = `${plan.staffIndex}|${plan.civilDate}`;
        const list = blocksByStaffDay.get(key) ?? [];
        list.push({ start, end });
        blocksByStaffDay.set(key, list);
      }

      let overlaps = 0;
      for (const blocks of blocksByStaffDay.values()) {
        blocks.sort((a, b) => a.start - b.start);
        for (let index = 1; index < blocks.length; index += 1) {
          if (blocks[index].start < blocks[index - 1].end) overlaps += 1;
        }
      }
      expect(overlaps).toBe(0);
    });

    it(`${business.id}: status coerentes com a janela e mix histórico realista`, () => {
      const past = plans.filter(plan => plan.dayOffset < 0);
      const today = plans.filter(plan => plan.dayOffset === 0);
      const future = plans.filter(plan => plan.dayOffset > 0);

      const pastStatuses = new Set(["COMPLETED", "CANCELLED", "NO_SHOW", "CONFIRMED"]);
      const todayStatuses = new Set(["COMPLETED", "CONFIRMED", "CHECKED_IN", "CANCELLED"]);
      const futureStatuses = new Set(["CONFIRMED", "CANCELLED"]);
      for (const plan of past) expect(pastStatuses.has(plan.status)).toBe(true);
      for (const plan of today) expect(todayStatuses.has(plan.status)).toBe(true);
      for (const plan of future) expect(futureStatuses.has(plan.status)).toBe(true);

      expect(past.length).toBeGreaterThan(100);
      const share = (status: string) => past.filter(plan => plan.status === status).length / past.length;
      expect(share("COMPLETED")).toBeGreaterThan(0.62);
      expect(share("COMPLETED")).toBeLessThan(0.85);
      expect(share("CANCELLED")).toBeGreaterThan(0.05);
      expect(share("NO_SHOW")).toBeGreaterThan(0.02);

      // Concluídos sempre no passado (nada futuro "finalizado").
      expect(plans.filter(plan => plan.status === "COMPLETED").every(plan => plan.dayOffset <= 0)).toBe(
        true,
      );
    });

    it(`${business.id}: agenda viva com 4 slots e dia seguinte aberto com 12 confirmações`, () => {
      const presentation = demoAgendaPresentation({
        business,
        today: TODAY,
        now: fixedNow,
        nowCivilTime: "12:00",
      });
      const livePlans = plans.filter(plan => plan.civilDate === presentation.liveDate);
      const fullPlans = plans.filter(plan => plan.civilDate === presentation.fullDate);

      expect(livePlans).toHaveLength(4);
      expect(livePlans.filter(plan => plan.status === "COMPLETED")).toHaveLength(2);
      expect(livePlans.filter(plan => plan.status === "CHECKED_IN")).toHaveLength(1);
      expect(livePlans.filter(plan => plan.status === "CONFIRMED")).toHaveLength(1);

      const checkedIn = livePlans.find(plan => plan.status === "CHECKED_IN");
      const confirmed = livePlans.find(plan => plan.status === "CONFIRMED");
      expect(checkedIn).toBeDefined();
      expect(confirmed).toBeDefined();
      expect(timeToMinutes(confirmed!.time) - timeToMinutes(checkedIn!.time)).toBe(240);

      expect(fullPlans).toHaveLength(12);
      expect(fullPlans.every(plan => plan.status === "CONFIRMED")).toBe(true);
      for (let staffIndex = 0; staffIndex < 2; staffIndex += 1) {
        expect(fullPlans.filter(plan => plan.staffIndex === staffIndex)).toHaveLength(6);
      }
    });
  }
});
