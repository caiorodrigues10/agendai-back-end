/// <reference types="vitest/globals" />
import {
  getRedisUnavailableDrops,
  resetRedisUnavailableDrops,
} from "../../lossCounters";
import {
  RecordSalonTrafficUseCase,
  type RecordSalonTrafficRequest,
} from "./RecordSalonTrafficUseCase";
import type { ITrafficCounter } from "../ports/ITrafficCounter";
import type {
  ISalonAttributionResolver,
  SalonTrafficAttribution,
} from "../ports/ISalonAttributionResolver";

const SHOP_UUID = "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33";

function request(
  overrides: Partial<RecordSalonTrafficRequest> = {},
): RecordSalonTrafficRequest {
  return {
    path: "/queue/:id",
    referrer: "https://www.example.com/",
    ip: "203.0.113.10",
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
    headers: {},
    origin: "https://app.example.com",
    allowedOrigins: ["https://app.example.com"],
    ignoreHosts: [],
    enabled: true,
    salon: {
      route: "/queue/:id",
      salon: SHOP_UUID,
      salonType: "id",
      kind: "visit",
      tab: "queue",
    },
    ...overrides,
  };
}

describe("RecordSalonTrafficUseCase", () => {
  let counter: ITrafficCounter;
  let resolver: ISalonAttributionResolver;
  let useCase: RecordSalonTrafficUseCase;

  beforeEach(() => {
    resetRedisUnavailableDrops();
    counter = {
      consumeRateLimit: vi.fn().mockResolvedValue(true),
      recordVisit: vi.fn().mockResolvedValue(undefined),
      recordSalonVisit: vi.fn().mockResolvedValue(undefined),
    };
    resolver = {
      resolve: vi.fn().mockResolvedValue({
        kind: "barbershop",
        id: SHOP_UUID,
        target: `b:${SHOP_UUID}`,
      } satisfies SalonTrafficAttribution),
    };
    useCase = new RecordSalonTrafficUseCase(counter, resolver);
  });

  it("não toca no Redis quando o beacon está desabilitado", async () => {
    const result = await useCase.execute(request({ enabled: false }));

    expect(result).toEqual({ counted: false, reason: "disabled" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
    expect(counter.recordSalonVisit).not.toHaveBeenCalled();
  });

  it.each([
    ["DNT", { dnt: "1" }],
    ["GPC", { "sec-gpc": "1" }],
    ["prefetch", { "sec-purpose": "prefetch" }],
  ])("descarta %s antes de contar", async (_name, headers) => {
    const result = await useCase.execute(request({ headers }));

    expect(result).toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta bots", async () => {
    const result = await useCase.execute(request({ userAgent: "Googlebot/2.1" }));

    expect(result).toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta origem não permitida", async () => {
    const result = await useCase.execute(request({ origin: "https://evil.example.com" }));

    expect(result).toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta silenciosamente o excedente da cota por IP", async () => {
    vi.mocked(counter.consumeRateLimit).mockResolvedValue(false);

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "rate_limited" });
    expect(counter.recordSalonVisit).not.toHaveBeenCalled();
  });

  it("descarta silenciosamente o ping de salão inexistente", async () => {
    vi.mocked(resolver.resolve).mockResolvedValue(null);

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "salon_unresolved" });
    expect(counter.recordSalonVisit).not.toHaveBeenCalled();
    // A mesma resposta do ping válido — sem sinal de enumeração de ids.
    expect(counter.recordVisit).not.toHaveBeenCalled();
  });

  it("descarta silenciosamente quando a resolução do salão falha", async () => {
    vi.mocked(resolver.resolve).mockRejectedValue(new Error("db down"));

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "salon_unresolved" });
    expect(counter.recordSalonVisit).not.toHaveBeenCalled();
  });

  it("conta a visita do salão com o alvo resolvido e o dia civil de São Paulo", async () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    const result = await useCase.execute(request(), now);

    expect(result).toEqual({
      counted: true,
      area: "salon_public",
      section: "queue",
      target: `b:${SHOP_UUID}`,
    });
    expect(resolver.resolve).toHaveBeenCalledWith(SHOP_UUID, "id");
    expect(counter.recordSalonVisit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(counter.recordSalonVisit).mock.calls[0]![0]).toEqual({
      target: `b:${SHOP_UUID}`,
      section: "queue",
      kind: "visit",
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
      dayKey: "2026-11-15",
      hour: 9,
      originHost: "www.example.com",
    });
  });

  it("mantém a visita do salão também no contador global (área salon_public)", async () => {
    await useCase.execute(request(), new Date("2026-11-15T12:00:00.000Z"));

    expect(counter.recordVisit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(counter.recordVisit).mock.calls[0]![0]).toMatchObject({
      area: "salon_public",
      dayKey: "2026-11-15",
      hour: 9,
    });
  });

  it("ping de aba não soma visita nem visitante no contador global", async () => {
    const result = await useCase.execute(
      request({
        salon: {
          route: "/queue/:id",
          salon: SHOP_UUID,
          salonType: "id",
          kind: "tab",
          tab: "profile",
        },
      }),
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(result).toEqual({
      counted: true,
      area: "salon_public",
      section: "profile",
      target: `b:${SHOP_UUID}`,
    });
    expect(vi.mocked(counter.recordSalonVisit).mock.calls[0]![0]).toMatchObject({
      kind: "tab",
      section: "profile",
    });
    expect(counter.recordVisit).not.toHaveBeenCalled();
  });

  it("atribui o ping de slug à organização", async () => {
    vi.mocked(resolver.resolve).mockResolvedValue({
      kind: "organization",
      id: "org-uuid",
      target: "o:org-uuid",
    });

    const result = await useCase.execute(
      request({
        path: "/s/:slug",
        salon: {
          route: "/s/:slug",
          salon: "acme-barbearia",
          salonType: "slug",
          kind: "visit",
        },
      }),
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(result).toMatchObject({ counted: true, section: "profile", target: "o:org-uuid" });
    expect(resolver.resolve).toHaveBeenCalledWith("acme-barbearia", "slug");
  });

  it("não passa o identificador público para o contador (só a chave de atribuição)", async () => {
    await useCase.execute(
      request({
        salon: {
          route: "/s/:slug",
          salon: "acme-barbearia",
          salonType: "slug",
          kind: "visit",
        },
      }),
      new Date("2026-11-15T12:00:00.000Z"),
    );

    const recorded = JSON.stringify(
      vi.mocked(counter.recordSalonVisit).mock.calls[0]![0],
    );
    expect(recorded).not.toContain("acme-barbearia");
    expect(recorded).not.toContain("/s/:slug");
  });

  it("converte falha do Redis em descarte aceito e aumenta a métrica de perda", async () => {
    vi.mocked(counter.recordSalonVisit).mockRejectedValue(new Error("redis down"));

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "counter_error" });
    expect(getRedisUnavailableDrops()).toBe(1);
  });

  it("não invalida a contagem do salão quando a escrita global falha", async () => {
    vi.mocked(counter.recordVisit).mockRejectedValue(new Error("redis down"));

    const result = await useCase.execute(request());

    expect(result).toMatchObject({ counted: true, target: `b:${SHOP_UUID}` });
    expect(getRedisUnavailableDrops()).toBe(1);
  });
});
