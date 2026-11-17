/// <reference types="vitest/globals" />
import {
  getRedisUnavailableDrops,
  resetRedisUnavailableDrops,
} from "../../lossCounters";
import {
  RecordVisitUseCase,
  type RecordVisitRequest,
} from "./RecordVisitUseCase";
import type { ITrafficCounter } from "../ports/ITrafficCounter";

function request(overrides: Partial<RecordVisitRequest> = {}): RecordVisitRequest {
  return {
    path: "/",
    referrer: "https://www.example.com/",
    ip: "203.0.113.10",
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
    headers: {},
    origin: "https://app.example.com",
    allowedOrigins: ["https://app.example.com"],
    ignoreHosts: [],
    enabled: true,
    ...overrides,
  };
}

describe("RecordVisitUseCase", () => {
  let counter: ITrafficCounter;
  let useCase: RecordVisitUseCase;

  beforeEach(() => {
    resetRedisUnavailableDrops();
    counter = {
      consumeRateLimit: vi.fn().mockResolvedValue(true),
      recordVisit: vi.fn().mockResolvedValue(undefined),
      recordSalonVisit: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new RecordVisitUseCase(counter);
  });

  it("não toca no Redis quando o beacon está desabilitado", async () => {
    const result = await useCase.execute(request({ enabled: false }));

    expect(result).toEqual({ counted: false, reason: "disabled" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
    expect(counter.recordVisit).not.toHaveBeenCalled();
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

  it("descarta o painel master", async () => {
    const result = await useCase.execute(request({ path: "/master/traffic" }));

    expect(result).toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta origem ausente ou não permitida", async () => {
    await expect(useCase.execute(request({ origin: undefined }))).resolves.toEqual({
      counted: false,
      reason: "excluded",
    });
    await expect(
      useCase.execute(request({ origin: "https://evil.example.com" })),
    ).resolves.toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta Origin sem esquema mesmo se ele estiver na allowlist", async () => {
    const result = await useCase.execute(
      request({
        origin: "app.example.com",
        allowedOrigins: ["app.example.com"],
      }),
    );

    expect(result).toEqual({ counted: false, reason: "excluded" });
    expect(counter.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("descarta silently o excedente da cota por IP", async () => {
    vi.mocked(counter.consumeRateLimit).mockResolvedValue(false);

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "rate_limited" });
    expect(counter.recordVisit).not.toHaveBeenCalled();
  });

  it("conta uma visita válida sem passar path, token ou referrer ao adapter", async () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    const result = await useCase.execute(
      request({
        path: "/app/agenda?token=super-secret",
        referrer: "https://www.example.com/path?manageToken=also-secret",
      }),
      now,
    );

    expect(result).toEqual({ counted: true, area: "logged_area" });
    expect(counter.recordVisit).toHaveBeenCalledTimes(1);
    const recorded = vi.mocked(counter.recordVisit).mock.calls[0]![0];
    expect(recorded).toEqual({
      area: "logged_area",
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
      dayKey: "2026-11-15",
      hour: 9,
      originHost: "www.example.com",
    });
    expect(JSON.stringify(recorded)).not.toContain("super-secret");
    expect(JSON.stringify(recorded)).not.toContain("also-secret");
  });

  it("aceita o hostname de referrer enviado pelo front", async () => {
    const result = await useCase.execute(
      request({ referrer: "www.example.com" }),
      new Date("2026-11-15T12:00:00.000Z"),
    );

    expect(result).toEqual({ counted: true, area: "public_site" });
    expect(vi.mocked(counter.recordVisit).mock.calls[0]![0].originHost).toBe(
      "www.example.com",
    );
  });

  it("converte falha do Redis em descarte aceito e aumenta a métrica de perda", async () => {
    vi.mocked(counter.recordVisit).mockRejectedValue(new Error("redis down"));

    const result = await useCase.execute(request());

    expect(result).toEqual({ counted: false, reason: "counter_error" });
    expect(getRedisUnavailableDrops()).toBe(1);
  });
});
