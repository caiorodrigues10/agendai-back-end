/// <reference types="vitest/globals" />
import { Job } from "bullmq";
import { toBullJobId } from "./jobId";

function validateJobId(jobId: string): void {
  const job = Object.create(Job.prototype) as {
    opts: Record<string, unknown>;
    name: string;
    validateOptions: (jobData: { data: string }) => void;
    optsJobId?: unknown;
  };
  job.opts = { jobId };
  job.name = "verify_email";
  job.validateOptions({ data: "" });
}

describe("toBullJobId", () => {
  it("a chave de dedup original derruba o BullMQ (Custom Id cannot contain :)", () => {
    expect(() => validateJobId("verify-email:u-1")).toThrow(
      "Custom Id cannot contain :",
    );
  });

  it("jobId sanitizado passa na validação do BullMQ", () => {
    const jobId = toBullJobId("verify-email:u-1");
    expect(jobId).toBe("verify-email-u-1");
    expect(() => validateJobId(jobId as string)).not.toThrow();
  });

  it("sanitiza chaves com dois separadores (ex.: position, review, product-reservation)", () => {
    expect(toBullJobId("position:shop-1:item-9:3")).toBe(
      "position-shop-1-item-9-3",
    );
    expect(toBullJobId("review:appointment:a1")).toBe("review-appointment-a1");
    expect(toBullJobId("product-reservation:r1:email")).toBe(
      "product-reservation-r1-email",
    );
    expect(() => validateJobId(toBullJobId("position:s1:i9:3") as string)).not.toThrow();
  });

  it("retorna undefined quando não há chave de dedup", () => {
    expect(toBullJobId(undefined)).toBeUndefined();
    expect(toBullJobId("")).toBeUndefined();
  });
});
