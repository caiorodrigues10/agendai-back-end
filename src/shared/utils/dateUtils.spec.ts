/// <reference types="vitest/globals" />
import {
  isValidDate,
  isNotPast,
  isWithinHorizon,
  isValidTime,
  isBusinessHour,
  addMinutes,
  timesOverlap,
  civilDayBounds,
  utcDayBounds,
  DEFAULT_SHOP_TIMEZONE,
} from "./dateUtils";

describe("dateUtils", () => {
  describe("isValidDate", () => {
    it("aceita data válida", () => {
      expect(isValidDate("2026-08-06")).toBe(true);
    });

    it("aceita 29/02 em ano bissexto", () => {
      expect(isValidDate("2024-02-29")).toBe(true);
    });

    it("rejeita 29/02 em ano não bissexto", () => {
      expect(isValidDate("2025-02-29")).toBe(false);
    });

    it("rejeita 31/04 (abril tem 30 dias)", () => {
      expect(isValidDate("2026-04-31")).toBe(false);
    });

    it("rejeita formato inválido", () => {
      expect(isValidDate("06/08/2026")).toBe(false);
      expect(isValidDate("2026-8-6")).toBe(false);
      expect(isValidDate("abc")).toBe(false);
    });
  });

  describe("isNotPast", () => {
    it("aceita data futura", () => {
      expect(isNotPast("2099-12-31")).toBe(true);
    });

    it("rejeita ano 0001", () => {
      expect(isNotPast("0001-01-01")).toBe(false);
    });
  });

  describe("isWithinHorizon", () => {
    it("aceita data dentro do horizonte", () => {
      expect(isWithinHorizon("2026-08-10")).toBe(true);
    });

    it("rejeita data muito distante", () => {
      expect(isWithinHorizon("2099-12-31")).toBe(false);
    });
  });

  describe("isValidTime", () => {
    it("aceita horário válido", () => {
      expect(isValidTime("08:30")).toBe(true);
      expect(isValidTime("00:00")).toBe(true);
      expect(isValidTime("23:59")).toBe(true);
    });

    it("rejeita horário inválido", () => {
      expect(isValidTime("25:00")).toBe(false);
      expect(isValidTime("12:60")).toBe(false);
      expect(isValidTime("abc")).toBe(false);
    });
  });

  describe("isBusinessHour", () => {
    it("aceita horário comercial", () => {
      expect(isBusinessHour("07:00")).toBe(true);
      expect(isBusinessHour("12:00")).toBe(true);
      expect(isBusinessHour("22:00")).toBe(true);
    });

    it("rejeita antes do comercial", () => {
      expect(isBusinessHour("06:59")).toBe(false);
    });

    it("rejeita depois do comercial", () => {
      expect(isBusinessHour("22:01")).toBe(false);
    });
  });

  describe("addMinutes", () => {
    it("soma minutos normalmente", () => {
      expect(addMinutes("08:30", 90)).toBe("10:00");
    });

    it("crossover de hora", () => {
      expect(addMinutes("23:30", 60)).toBe("00:30");
    });

    it("zero minutos", () => {
      expect(addMinutes("14:00", 0)).toBe("14:00");
    });
  });

  describe("timesOverlap", () => {
    it("detecta sobreposição", () => {
      expect(timesOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
    });

    it("detecta sem sobreposição", () => {
      expect(timesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
    });

    it("intervalo contido", () => {
      expect(timesOverlap("08:00", "10:00", "08:30", "09:30")).toBe(true);
    });
  });
});

describe("dateUtils — civilDayBounds (dia civil no fuso do salão)", () => {
  const SAO_PAULO = "America/Sao_Paulo";

  it("meia-noite local de São Paulo (UTC-3) vira 03:00 UTC", () => {
    const { gte, lt } = civilDayBounds("2026-10-05", SAO_PAULO);

    expect(gte.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });

  it("evento às 22h locais do último dia do intervalo ENTRA", () => {
    const { lt } = civilDayBounds("2026-10-05", SAO_PAULO);
    // 2026-10-06T01:00Z = 2026-10-05 22:00 em São Paulo
    const evento = new Date("2026-10-06T01:00:00.000Z");

    expect(evento.getTime()).toBeLessThan(lt.getTime());
  });

  it("evento às 01h UTC do dia seguinte (22h locais) entra no dia certo", () => {
    const dia05 = civilDayBounds("2026-10-05", SAO_PAULO);
    const dia06 = civilDayBounds("2026-10-06", SAO_PAULO);
    const evento = new Date("2026-10-06T01:00:00.000Z"); // 22h de 05/10 em SP

    // pertence ao dia 05 e NÃO ao dia 06
    expect(evento.getTime()).toBeLessThan(dia05.lt.getTime());
    expect(evento.getTime()).toBeGreaterThanOrEqual(dia05.gte.getTime());
    expect(evento.getTime()).toBeLessThan(dia06.gte.getTime());
  });

  it("evento às 23h59 locais do dia entra; 00h do dia seguinte, não", () => {
    const { gte, lt } = civilDayBounds("2026-10-05", SAO_PAULO);

    expect(new Date("2026-10-06T02:59:59.999Z").getTime()).toBeLessThan(lt.getTime());
    expect(new Date("2026-10-06T03:00:00.000Z").getTime()).toBeGreaterThanOrEqual(lt.getTime());
    expect(new Date("2026-10-05T02:59:59.999Z").getTime()).toBeLessThan(gte.getTime());
  });

  it("virada de mês: o limite final é a meia-noite do dia 1 seguinte", () => {
    const { gte, lt } = civilDayBounds("2026-10-31", SAO_PAULO);

    expect(gte.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("fallback: sem fuso usa America/Sao_Paulo", () => {
    const comFuso = civilDayBounds("2026-10-05", SAO_PAULO);
    const semFuso = civilDayBounds("2026-10-05");

    expect(semFuso.gte.toISOString()).toBe(comFuso.gte.toISOString());
    expect(semFuso.lt.toISOString()).toBe(comFuso.lt.toISOString());
    expect(DEFAULT_SHOP_TIMEZONE).toBe("America/Sao_Paulo");
  });

  it("fallback: fuso inválido usa America/Sao_Paulo", () => {
    const comFuso = civilDayBounds("2026-10-05", SAO_PAULO);
    const invalido = civilDayBounds("2026-10-05", "Fuso/Invalido");

    expect(invalido.gte.toISOString()).toBe(comFuso.gte.toISOString());
    expect(invalido.lt.toISOString()).toBe(comFuso.lt.toISOString());
  });

  describe("horário de verão", () => {
    it("NY: dia da virada para o horário de verão tem 23 horas", () => {
      const { gte, lt } = civilDayBounds("2026-03-08", "America/New_York");

      expect(gte.toISOString()).toBe("2026-03-08T05:00:00.000Z"); // 00:00 EST
      expect(lt.toISOString()).toBe("2026-03-09T04:00:00.000Z"); // 00:00 EDT
      expect((lt.getTime() - gte.getTime()) / 3_600_000).toBe(23);
    });

    it("NY: dia da virada de volta tem 25 horas", () => {
      const { gte, lt } = civilDayBounds("2026-11-01", "America/New_York");

      expect(gte.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // 00:00 EDT
      expect(lt.toISOString()).toBe("2026-11-02T05:00:00.000Z"); // 00:00 EST
      expect((lt.getTime() - gte.getTime()) / 3_600_000).toBe(25);
    });

    it("NY: dia seguinte da virada continua com meia-noite exata", () => {
      const { gte } = civilDayBounds("2026-03-09", "America/New_York");

      expect(gte.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    });

    it("SP histórico: meia-noite inexistente (saltou de 23:59 para 01:00)", () => {
      // Brasil began DST em 04/11/2018 às 00:00 → 01:00
      const { gte } = civilDayBounds("2018-11-04", SAO_PAULO);

      // primeiro instante do dia (01:00 local = 03:00Z)
      expect(gte.toISOString()).toBe("2018-11-04T03:00:00.000Z");
    });

    it("SP histórico: dia comum usa meia-noite local", () => {
      const { gte } = civilDayBounds("2018-11-05", SAO_PAULO);

      expect(gte.toISOString()).toBe("2018-11-05T02:00:00.000Z"); // 00:00 em BRST
    });
  });

  it("utcDayBounds continua em UTC (colunas @db.Date)", () => {
    const { gte, lt } = utcDayBounds("2026-10-05");

    expect(gte.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});
