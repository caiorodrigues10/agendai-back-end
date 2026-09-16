import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeIdempotent, resetIdempotencyMemoryForTests } from "./idempotencyService";

function request(key?: string, body?: unknown) {
  return {
    headers: key ? { "idempotency-key": key } : {},
    user: { id: "owner-1" },
    ip: "127.0.0.1",
    correlationId: "correlation-1",
    body: body ?? null,
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

  it("different scopes do not interfere with each other", async () => {
    const op1 = vi.fn().mockResolvedValue({ scope: "a" });
    const op2 = vi.fn().mockResolvedValue({ scope: "b" });
    const first = await executeIdempotent(request("shared-key-00001"), "scopeA", op1);
    const second = await executeIdempotent(request("shared-key-00001"), "scopeB", op2);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(op1).toHaveBeenCalledTimes(1);
    expect(op2).toHaveBeenCalledTimes(1);
  });

  it("different owners with same key and scope are independent", async () => {
    const op = vi.fn().mockResolvedValue({ done: true });
    const req1 = request("same-key-0000001");
    req1.user = { id: "user-1" };
    const req2 = request("same-key-0000001");
    req2.user = { id: "user-2" };
    const first = await executeIdempotent(req1, "pay", op);
    const second = await executeIdempotent(req2, "pay", op);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(op).toHaveBeenCalledTimes(2);
  });
});
