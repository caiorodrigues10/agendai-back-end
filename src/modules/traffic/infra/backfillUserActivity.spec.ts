/// <reference types="vitest/globals" />
import { buildUserActivityBackfillBatches } from "./backfillUserActivity";

describe("janelas do backfill de atividade", () => {
  it("cria seis lotes mensais contíguos com o mesmo instante de referência", () => {
    const anchor = new Date("2026-11-15T12:34:56.789Z");
    const batches = buildUserActivityBackfillBatches(anchor, 6);

    expect(batches).toHaveLength(6);
    expect(batches[0]).toEqual({
      from: new Date("2026-05-15T12:34:56.789Z"),
      to: new Date("2026-06-15T12:34:56.789Z"),
    });
    expect(batches.at(-1)).toEqual({
      from: new Date("2026-10-15T12:34:56.789Z"),
      to: anchor,
    });

    for (let index = 1; index < batches.length; index += 1) {
      expect(batches[index].from.getTime()).toBe(batches[index - 1].to.getTime());
    }
  });

  it("limita o dia ao último dia do mês de destino", () => {
    const batches = buildUserActivityBackfillBatches(
      new Date("2026-03-31T00:00:00.000Z"),
      2,
    );

    expect(batches[0].from.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(batches[0].to.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("rejeita uma janela fora do intervalo suportado", () => {
    expect(() => buildUserActivityBackfillBatches(new Date(), 0)).toThrow();
    expect(() => buildUserActivityBackfillBatches(new Date(), 13)).toThrow();
  });
});
