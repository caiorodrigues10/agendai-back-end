import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { WhatsAppConnectionUseCase } from "./WhatsAppConnectionUseCase";
import { AppError } from "@/shared/errors/AppError";
import { shopEvolutionInstanceName } from "../../utils/shopEvolutionInstance";

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("WhatsAppConnectionUseCase", () => {
  const originalFetch = globalThis.fetch;
  let repo: MockBarbershopRepository;
  let useCase: WhatsAppConnectionUseCase;

  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "http://evo.test";
    process.env.EVOLUTION_API_KEY = "key";
    repo = new MockBarbershopRepository();
    useCase = new WhatsAppConnectionUseCase(repo as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    vi.restoreAllMocks();
  });

  it("connect grava shop-{id} e devolve QR", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    const expectedName = shopEvolutionInstanceName(shop.id);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/instance/create")) {
        return jsonRes(201, { qrcode: { base64: "abcQR" } }) as any;
      }
      if (url.includes("/instance/connectionState")) {
        return jsonRes(200, { instance: { state: "connecting" } }) as any;
      }
      if (url.includes("/instance/connect")) {
        return jsonRes(200, { base64: "abcQR" }) as any;
      }
      return jsonRes(200, {}) as any;
    }) as any;

    const result = await useCase.connect(shop.id, { role: "OWNER", barbershopId: shop.id }, { method: "qr" });

    expect(result.status).toBe("connecting");
    expect(result.connected).toBe(false);
    expect(result.qrcodeBase64).toContain("abcQR");
    expect(result.method).toBe("qr");
    const stored = await repo.findById(shop.id);
    expect(stored?.evolutionInstanceName).toBe(expectedName);
    expect(expectedName).toBe(`shop-${shop.id}`);
  });

  it("disconnect zera evolutionInstanceName", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    await repo.update(shop.id, { evolutionInstanceName: shopEvolutionInstanceName(shop.id) });

    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes(200, {})) as any;

    const result = await useCase.disconnect(shop.id, { role: "OWNER", barbershopId: shop.id });

    expect(result).toEqual({ status: "disconnected", connected: false, qrcodeBase64: null, method: null, pairingCode: null });
    const stored = await repo.findById(shop.id);
    expect(stored?.evolutionInstanceName).toBeNull();
  });

  it("status disconnected quando não há instância gravada", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    const result = await useCase.status(shop.id, { role: "OWNER", barbershopId: shop.id });
    expect(result).toEqual({ status: "disconnected", connected: false, qrcodeBase64: null, method: null, pairingCode: null });
  });

  it("OWNER de outro salão recebe 403", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    await expect(
      useCase.status(shop.id, { role: "OWNER", barbershopId: "outro-id" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("503 se Evolution não estiver configurada", async () => {
    delete process.env.EVOLUTION_API_URL;
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    await expect(
      useCase.connect(shop.id, { role: "MASTER_ADMIN" })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      useCase.connect(shop.id, { role: "MASTER_ADMIN" })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("connect por código normaliza o telefone e não devolve QR", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/instance/delete")) return jsonRes(200, {}) as any;
      if (url.includes("/instance/create")) {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        expect(body.qrcode).toBe(false);
        expect(body.number).toBe("5511999999999");
        return jsonRes(201, {}) as any;
      }
      if (url.includes("/instance/connectionState")) return jsonRes(200, { instance: { state: "close" } }) as any;
      if (url.includes("/instance/connect") && url.includes("number=5511999999999")) {
        return jsonRes(200, { pairingCode: "ABCD1234" }) as any;
      }
      return jsonRes(200, {}) as any;
    }) as any;

    const resultPromise = useCase.connect(
      shop.id,
      { role: "OWNER", barbershopId: shop.id },
      { method: "pairing_code", phoneNumber: "(11) 99999-9999" }
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toMatchObject({
      status: "connecting",
      connected: false,
      method: "pairing_code",
      pairingCode: "ABCD1234",
      qrcodeBase64: null,
    });
    expect(
      (globalThis.fetch as any).mock.calls.some((call: any[]) =>
        String(call[0]).includes("number=5511999999999")
      )
    ).toBe(true);
    vi.useRealTimers();
  });

  it("status não gera QR nem chama endpoint de conexão", async () => {
    const shop = await repo.create({ name: "Salon", whatsapp: "11999999999" });
    await repo.update(shop.id, { evolutionInstanceName: shopEvolutionInstanceName(shop.id) });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("connectionState")) return jsonRes(200, { instance: { state: "connecting" } }) as any;
      return jsonRes(200, {}) as any;
    }) as any;
    await useCase.status(shop.id, { role: "OWNER", barbershopId: shop.id });
    expect((globalThis.fetch as any).mock.calls.some((call: any[]) => String(call[0]).includes("/instance/connect/"))).toBe(false);
  });
});
