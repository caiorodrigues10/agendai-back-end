/// <reference types="vitest/globals" />
import { resolveOwnerBotPeriod } from "./periods";
import { shopDateKey } from "@/modules/financial/ledger/shopTime";
import { civilDayBounds } from "@/shared/utils/dateUtils";

/**
 * O período do bot do dono é calculado no fuso do salão (`shopDayRange` /
 * `shopMonthRange`). Antes do helper `civilDayBounds`, a listagem de despesas
 * recebia os `Date` do período (início/fim exatos no fuso do salão); hoje
 * recebe os dias civis + o fuso. Este spec prova que a janela resultante
 * **cobre os mesmos instantes** de antes.
 */
describe("whatsappOwnerBot — período da listagem de despesas cobre o mesmo intervalo", () => {
  const timezone = "America/Sao_Paulo";
  const agora = new Date("2026-11-15T12:00:00.000Z");

  const limites = (period: { from: Date; to: Date }) => ({
    gte: civilDayBounds(shopDateKey(period.from, timezone), timezone).gte,
    lt: civilDayBounds(shopDateKey(period.to, timezone), timezone).lt,
  });

  it("dia: o dia inteiro do salão", () => {
    const period = resolveOwnerBotPeriod("", timezone, agora, "day")!;
    const { gte, lt } = limites(period);

    // antes: gte = period.from, lte = period.to
    expect(gte.getTime()).toBeLessThanOrEqual(period.from.getTime());
    expect(lt.getTime()).toBeGreaterThan(period.to.getTime());
    expect(gte.toISOString()).toBe("2026-11-15T03:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-11-16T03:00:00.000Z");
  });

  it("mês: do dia 1 ao último dia do mês, no fuso do salão", () => {
    const period = resolveOwnerBotPeriod("", timezone, agora, "month")!;
    const { gte, lt } = limites(period);

    expect(gte.getTime()).toBeLessThanOrEqual(period.from.getTime());
    expect(lt.getTime()).toBeGreaterThan(period.to.getTime());
    expect(gte.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("semana: começa no domingo local e termina no sábado local", () => {
    const period = resolveOwnerBotPeriod("", timezone, agora, "week")!;
    const { gte, lt } = limites(period);

    expect(gte.getTime()).toBeLessThanOrEqual(period.from.getTime());
    expect(lt.getTime()).toBeGreaterThan(period.to.getTime());
    expect(gte.toISOString()).toBe("2026-11-15T03:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-11-22T03:00:00.000Z");
  });

  it("evento às 22h do último dia do período entra na janela", () => {
    const period = resolveOwnerBotPeriod("", timezone, agora, "month")!;
    const { lt } = limites(period);

    // 2026-11-30T22:00 em São Paulo = 2026-12-01T01:00Z
    const evento = new Date("2026-12-01T01:00:00.000Z");
    expect(evento.getTime()).toBeLessThan(lt.getTime());
  });
});
