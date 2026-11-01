import { describe, it, expect, vi } from "vitest";
import { ListFailedWhatsAppNotificationsUseCase } from "./ListFailedWhatsAppNotificationsUseCase";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    barbershopId: "shop-1",
    channel: "WHATSAPP",
    type: "APPOINTMENT_REMINDER",
    status: "FAILED",
    errorCode: null,
    errorMessage: "sem rede",
    createdAt: new Date(),
    destinationHash: "hash-1",
    ...overrides,
  };
}

function harness(input: {
  deliveries?: unknown[];
  outbox?: unknown[];
  paused?: boolean;
  suppressedHashes?: string[];
  disabledPreferences?: string[];
} = {}) {
  const repo = {
    listFailed: vi.fn().mockResolvedValue({
      deliveries: input.deliveries ?? [delivery()],
      outbox: input.outbox ?? [],
    }),
    findActiveSuppressions: vi.fn().mockResolvedValue(input.suppressedHashes ?? []),
    findDisabledPreferences: vi.fn().mockResolvedValue(input.disabledPreferences ?? []),
  };
  const settingsRepo = {
    get: vi.fn().mockResolvedValue({ outboundPaused: input.paused ?? false }),
  };
  const useCase = new ListFailedWhatsAppNotificationsUseCase(repo as never, settingsRepo as never);
  return { useCase, repo };
}

describe("ListFailedWhatsAppNotificationsUseCase", () => {
  it("marca entrega suprimida como não reenviável", async () => {
    const { useCase } = harness({
      deliveries: [delivery({ status: "SUPPRESSED" })],
    });

    const result = await useCase.execute();

    expect(result.deliveries[0].retryable).toBe(false);
    expect(result.deliveries[0].notRetryableReason).toBe("Destinatário suprimido");
  });

  it("marca reclamação do destinatário como não reenviável", async () => {
    const { useCase } = harness({
      deliveries: [delivery({ status: "COMPLAINED" })],
    });

    const result = await useCase.execute();

    expect(result.deliveries[0].retryable).toBe(false);
    expect(result.deliveries[0].notRetryableReason).toBe("Reclamação do destinatário");
  });

  it("marca falha como não reenviável quando os envios estão pausados", async () => {
    const { useCase } = harness({ paused: true });

    const result = await useCase.execute();

    expect(result.deliveries[0].retryable).toBe(false);
    expect(result.deliveries[0].notRetryableReason).toBe("Envios pausados globalmente");
  });

  it("mantém falha comum como reenviável", async () => {
    const { useCase } = harness();

    const result = await useCase.execute();

    expect(result.deliveries[0].retryable).toBe(true);
    expect(result.deliveries[0].notRetryableReason).toBeUndefined();
  });

  it("considera supressão ativa e preferência desligada do salão", async () => {
    const suppressed = harness({ suppressedHashes: ["hash-1"] });
    const suppressedResult = await suppressed.useCase.execute();
    expect(suppressedResult.deliveries[0].retryable).toBe(false);
    expect(suppressedResult.deliveries[0].notRetryableReason).toBe("Destinatário suprimido");

    const disabled = harness({ disabledPreferences: ["shop-1:APPOINTMENT_REMINDER"] });
    const disabledResult = await disabled.useCase.execute();
    expect(disabledResult.deliveries[0].retryable).toBe(false);
    expect(disabledResult.deliveries[0].notRetryableReason).toBe("Preferência de WhatsApp desligada");
  });

  it("não expõe o destinationHash na resposta", async () => {
    const { useCase } = harness();

    const result = await useCase.execute();

    expect(result.deliveries[0]).not.toHaveProperty("destinationHash");
  });

  it("calcula o reenvio dos itens do outbox", async () => {
    const { useCase } = harness({
      deliveries: [],
      outbox: [
        {
          id: "outbox-1",
          deliveryId: "delivery-1",
          status: "FAILED",
          lastError: "timeout",
          publishAttempts: 2,
          createdAt: new Date(),
          delivery: { status: "FAILED" },
        },
      ],
    });

    const result = await useCase.execute();
    expect(result.outbox[0].retryable).toBe(true);

    const paused = harness({
      deliveries: [],
      paused: true,
      outbox: [
        {
          id: "outbox-1",
          deliveryId: "delivery-1",
          status: "FAILED",
          lastError: "timeout",
          publishAttempts: 2,
          createdAt: new Date(),
          delivery: { status: "FAILED" },
        },
      ],
    });
    const pausedResult = await paused.useCase.execute();
    expect(pausedResult.outbox[0].retryable).toBe(false);
    expect(pausedResult.outbox[0].notRetryableReason).toBe("Envios pausados globalmente");
  });
});
