import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeIdempotent, resetIdempotencyMemoryForTests } from "./idempotencyService";

function request(key?: string) {
  return {
    headers: key ? { "idempotency-key": key } : {},
    user: { id: "owner-1" },
    ip: "127.0.0.1",
    correlationId: "correlation-1",
  } as any;
}

describe("idempotencyService", () => {
  beforeEach(() => resetIdempotencyMemoryForTests());

  it("replays the first result without executing the charge twice", async () => {
    const operation = vi.fn().mockResolvedValue({ invoiceId: "invoice-1" });
    const first = await executeIdempotent(request("checkout-key-0001"), "subscription", operation);
    const replay = await executeIdempotent(request("checkout-key-0001"), "subscription", operation);
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ data: { invoiceId: "invoice-1" }, replayed: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("rejects a charge without a valid Idempotency-Key", async () => {
    await expect(executeIdempotent(request(), "subscription", async () => ({}))).rejects.toMatchObject({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  });
});
