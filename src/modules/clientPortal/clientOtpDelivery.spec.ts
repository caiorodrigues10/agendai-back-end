import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ salon: vi.fn(), send: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({ prisma: { barbershop: { findFirst: mocks.salon } } }));
vi.mock("@/shared/services/evolutionApiService", () => ({ sendWhatsAppMessageDetailed: mocks.send }));
import { deliverClientOtp } from "./clientOtpDelivery";

describe("delivery of public comment OTP", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.salon.mockResolvedValue({ evolutionInstanceName: "salon-instance" }); mocks.send.mockResolvedValue({ ok: true }); });
  it("delivers via the salon instance with no global fallback", async () => {
    await deliverClientOtp("11987654321", "123456", "salon-id");
    expect(mocks.salon).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "salon-id", active: true } }));
    expect(mocks.send).toHaveBeenCalledWith("11987654321", expect.stringContaining("123456"), { instanceName: "salon-instance" });
  });
  it("uses the platform channel only for the generic client portal", async () => {
    await deliverClientOtp("11987654321", "123456");
    expect(mocks.salon).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(expect.any(String), expect.any(String), { platform: true });
  });
  it("does not pretend that a code was sent when WhatsApp is disconnected", async () => {
    mocks.salon.mockResolvedValue({ evolutionInstanceName: null });
    await expect(deliverClientOtp("11987654321", "123456", "salon-id")).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reports a safe error for provider failure, without leaking the code", async () => {
    mocks.send.mockResolvedValue({ ok: false, error: "private provider payload" });
    await expect(deliverClientOtp("11987654321", "123456", "salon-id")).rejects.toMatchObject({ statusCode: 503, message: expect.not.stringContaining("123456") });
  });
});
