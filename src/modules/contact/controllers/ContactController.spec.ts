/// <reference types="vitest/globals" />
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../useCases/SubmitContactMessageUseCase", () => ({
  SubmitContactMessageUseCase: class {
    async execute() {
      return { id: "notification-1" };
    }
  },
}));

import { ContactController } from "./ContactController";

const validBody = {
  name: "Cliente Teste",
  email: "cliente@example.com",
  topic: "suporte",
  message: "Mensagem de teste para o suporte.",
};

function makeRequest(ip: string, forwardedFor?: string): FastifyRequest {
  return {
    ip,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    body: validBody,
  } as unknown as FastifyRequest;
}

function makeReply(): FastifyReply {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

describe("ContactController (rate limit em memória por IP)", () => {
  it("ignora X-Forwarded-For forjado e limita pelo IP real", async () => {
    const controller = new ContactController();
    const reply = makeReply();
    const realIp = "203.0.113.10";

    // 5 envios do mesmo IP real, cada um com um X-Forwarded-For forjado
    // diferente: antes da correção o bucket era aberto pelo header forjado e
    // nenhum limite era atingido.
    for (let i = 0; i < 5; i++) {
      await controller.submit(makeRequest(realIp, `198.51.100.${i}`), reply);
    }

    await expect(
      controller.submit(makeRequest(realIp, "198.51.100.99"), reply)
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it("mantém buckets separados por IP real", async () => {
    const controller = new ContactController();
    const reply = makeReply();

    for (let i = 1; i <= 5; i++) {
      await expect(
        controller.submit(makeRequest(`192.0.2.${i}`), reply)
      ).resolves.toBeDefined();
    }
  });
});
