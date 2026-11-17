/// <reference types="vitest/globals" />
/**
 * Contrato HTTP do beacon (controller):
 *  - a resposta é SEMPRE 204 (nunca 4xx/5xx, nunca sinal de enumeração);
 *  - o corpo é sanitizado antes de chegar ao use case (zod remove o que não
 *    está no contrato — nada de campo extra persistido);
 *  - o log de descarte carrega apenas um enum fechado (`reason`): nem IP, nem
 *    user agent, nem payload, nem rota.
 */

type BeaconInput = Record<string, unknown>;

const recordVisit = vi.fn(async (_input: BeaconInput) => ({
  counted: true as const,
  area: "public_site" as const,
}));
const recordSalonVisit = vi.fn(async (_input: BeaconInput) => ({
  counted: true as const,
  area: "salon_public" as const,
  section: "queue" as const,
  target: "b:shop",
}));

async function loadController() {
  vi.resetModules();
  recordVisit.mockClear();
  recordSalonVisit.mockClear();

  vi.doMock("tsyringe", async (importOriginal) => {
    const actual = await importOriginal<typeof import("tsyringe")>();
    return {
      ...actual,
      container: {
        resolve: (token: { name?: string }) => {
          if (token?.name === "RecordSalonTrafficUseCase") {
            return { execute: recordSalonVisit };
          }
          return { execute: recordVisit };
        },
      },
    };
  });

  const module = await import("./TrafficBeaconController");
  return new module.TrafficBeaconController();
}

type LogCall = [payload: unknown, message?: string];

function request(body: unknown, headers: Record<string, string> = {}) {
  return {
    body,
    ip: "203.0.113.77",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh) Chrome/126 Safari/537.36",
      origin: "https://app.example.com",
      ...headers,
    },
    log: {
      debug: vi.fn((..._args: unknown[]) => undefined),
      info: vi.fn((..._args: unknown[]) => undefined),
      warn: vi.fn((..._args: unknown[]) => undefined),
      error: vi.fn((..._args: unknown[]) => undefined),
    },
  } as never;
}

function reply() {
  const sent = {
    status: vi.fn((..._args: unknown[]) => sent),
    send: vi.fn((..._args: unknown[]) => sent),
  };
  return sent as never;
}

describe("TrafficBeaconController", () => {
  beforeEach(() => {
    process.env.TRAFFIC_BEACON_ENABLED = "true";
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
  });

  afterEach(() => {
    delete process.env.TRAFFIC_BEACON_ENABLED;
    delete process.env.ALLOWED_ORIGINS;
  });

  it("responde 204 com corpo vazio para um ping global válido", async () => {
    const controller = await loadController();
    const req = request("p=%2F");
    const res = reply();

    await controller.handle(req, res);

    expect((res as never as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(204);
    expect((res as never as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith();
    expect(recordVisit).toHaveBeenCalledTimes(1);
  });

  it("responde 204 para payload malformado, sem tocar em nenhum use case", async () => {
    const controller = await loadController();
    const req = request("{");
    const res = reply();

    await controller.handle(req, res);

    expect((res as never as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(204);
    expect(recordVisit).not.toHaveBeenCalled();
    expect(recordSalonVisit).not.toHaveBeenCalled();
  });

  it("remove campos desconhecidos do payload antes de contar", async () => {
    const controller = await loadController();
    const req = request(
      JSON.stringify({
        p: "/queue/:id",
        salon: "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33",
        salonType: "id",
        kind: "visit",
        tab: "queue",
        token: "super-secret",
        userId: "abc",
        fingerprint: "xyz",
      }),
    );

    await controller.handle(req, reply());

    expect(recordSalonVisit).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(recordSalonVisit.mock.calls[0]![0]);
    expect(payload).not.toContain("super-secret");
    expect(payload).not.toContain("fingerprint");
    expect(payload).not.toContain("userId");
  });

  it("descarta o ping de salão incoerente sem responder com erro", async () => {
    const controller = await loadController();
    const res = reply();

    await controller.handle(
      request(
        JSON.stringify({
          p: "/queue/:id",
          salon: "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33",
          salonType: "slug",
          kind: "visit",
        }),
      ),
      res,
    );

    expect((res as never as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(204);
    expect(recordSalonVisit).not.toHaveBeenCalled();
  });

  it("nunca loga IP, user agent, payload ou rota — só o motivo do descarte", async () => {
    const controller = await loadController();
    const req = request(
      JSON.stringify({
        p: "/queue/:id",
        salon: "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33",
        salonType: "slug",
        kind: "visit",
      }),
    );

    await controller.handle(req, reply());

    const log = (req as never as { log: { debug: ReturnType<typeof vi.fn> } }).log;
    expect(log.debug).toHaveBeenCalledTimes(1);
    const [payload, message] = log.debug.mock.calls[0] as LogCall;
    expect(payload).toEqual({ reason: "excluded" });
    expect(message).toBe("traffic beacon discarded");
    const serialized = JSON.stringify(log.debug.mock.calls);
    expect(serialized).not.toContain("203.0.113.77");
    expect(serialized).not.toContain("Mozilla/5.0");
    expect(serialized).not.toContain("/queue/:id");
    expect(serialized).not.toContain("0f9d4a1c");
  });

  it("aceita o ping de salão como JSON e como pares de formulário", async () => {
    const controller = await loadController();
    const payload = {
      p: "/queue/:id",
      salon: "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33",
      salonType: "id",
      kind: "visit",
      tab: "queue",
    };

    await controller.handle(request(JSON.stringify(payload)), reply());
    await controller.handle(
      request(
        "p=%2Fqueue%2F%3Aid&salon=0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33&salonType=id&kind=visit&tab=queue",
      ),
      reply(),
    );

    expect(recordSalonVisit).toHaveBeenCalledTimes(2);
    for (const call of recordSalonVisit.mock.calls) {
      expect(call[0]).toMatchObject({
        salon: {
          route: "/queue/:id",
          salon: "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33",
          salonType: "id",
          kind: "visit",
          tab: "queue",
        },
      });
    }
  });
});

// Este arquivo não tem imports estáticos (usa `vi.mock` dinâmico): o
// `export {}` o torna MÓDULO, evitando declarar helpers no escopo global do
// TypeScript (conflita com specs irmãos sem imports).
export {};
