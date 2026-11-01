import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/shared/errors/AppError";
import { BatchSetShopAiEnabledUseCase } from "./BatchSetShopAiEnabledUseCase";
import { BatchSetShopOwnerBotUseCase } from "./BatchSetShopOwnerBotUseCase";
import { SetShopAiEnabledUseCase } from "./SetShopAiEnabledUseCase";
import { SetShopOwnerBotUseCase } from "./SetShopOwnerBotUseCase";
import { ListWhatsAppShopsUseCase } from "./ListWhatsAppShopsUseCase";
import { ListAiConversationsUseCase } from "./ListAiConversationsUseCase";
import { GetAiConversationUseCase } from "./GetAiConversationUseCase";
import { TransferAiConversationUseCase } from "./TransferAiConversationUseCase";
import { ListOwnerBotActionLogsUseCase } from "./ListOwnerBotActionLogsUseCase";
import { ListFailedWhatsAppNotificationsUseCase } from "./ListFailedWhatsAppNotificationsUseCase";
import { ListWhatsAppQueuesUseCase } from "./ListWhatsAppQueuesUseCase";
import { ReprocessWhatsAppJobUseCase } from "./ReprocessWhatsAppJobUseCase";
import { CleanWhatsAppJobUseCase } from "./CleanWhatsAppJobUseCase";
import { GetWhatsAppOverviewUseCase } from "./GetWhatsAppOverviewUseCase";
import { ReconnectWhatsAppInstanceUseCase } from "./ReconnectWhatsAppInstanceUseCase";
import { LogoutWhatsAppInstanceUseCase } from "./LogoutWhatsAppInstanceUseCase";

const evolutionMocks = vi.hoisted(() => ({
  fetchEvolutionConnectionState: vi.fn(),
  fetchEvolutionConnectionStateStrict: vi.fn(),
  fetchEvolutionQr: vi.fn(),
  createEvolutionInstance: vi.fn(),
  logoutEvolutionInstance: vi.fn(),
}));

vi.mock("@/shared/services/evolutionApiService", () => ({
  fetchEvolutionConnectionState: evolutionMocks.fetchEvolutionConnectionState,
  fetchEvolutionConnectionStateStrict: evolutionMocks.fetchEvolutionConnectionStateStrict,
  fetchEvolutionQr: evolutionMocks.fetchEvolutionQr,
  createEvolutionInstance: evolutionMocks.createEvolutionInstance,
  logoutEvolutionInstance: evolutionMocks.logoutEvolutionInstance,
}));

const REASON = "motivo com pelo menos dez caracteres";

function shopRepo() {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findAiTargets: vi.fn(),
    applyAiBatch: vi.fn(),
    applyAiSingle: vi.fn(),
    applyOwnerBotBatch: vi.fn(),
    applyOwnerBotSingle: vi.fn(),
  };
}

describe("use cases do controle master de WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("salões", () => {
    it("lote de IA recusa ids inexistentes", async () => {
      const repo = shopRepo();
      repo.findAiTargets.mockResolvedValue([{ id: "shop-1", whatsappAiEnabled: false }]);

      const useCase = new BatchSetShopAiEnabledUseCase(repo as never);
      await expect(
        useCase.execute({ ids: ["shop-1", "shop-2"], enabled: true, reason: REASON, userId: "admin-1" })
      ).rejects.toBeInstanceOf(AppError);
      expect(repo.applyAiBatch).not.toHaveBeenCalled();
    });

    it("lote de IA aplica em todos os alvos com auditoria", async () => {
      const repo = shopRepo();
      repo.findAiTargets.mockResolvedValue([
        { id: "shop-1", whatsappAiEnabled: false },
        { id: "shop-2", whatsappAiEnabled: true },
      ]);
      repo.applyAiBatch.mockResolvedValue(2);

      const useCase = new BatchSetShopAiEnabledUseCase(repo as never);
      const result = await useCase.execute({
        ids: ["shop-1", "shop-2"],
        enabled: true,
        reason: REASON,
        userId: "admin-1",
        ipAddress: "127.0.0.1",
      });

      expect(result).toEqual({ updated: 2 });
      expect(repo.applyAiBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          audit: { userId: "admin-1", ipAddress: "127.0.0.1", reason: REASON },
        })
      );
    });

    it("IA individual recusa conta inexistente", async () => {
      const repo = shopRepo();
      repo.findById.mockResolvedValue(null);

      const useCase = new SetShopAiEnabledUseCase(repo as never);
      await expect(
        useCase.execute({ id: "shop-1", enabled: true, reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("assistente em lote recusa ids inexistentes", async () => {
      const repo = shopRepo();
      repo.findAiTargets.mockResolvedValue([]);

      const useCase = new BatchSetShopOwnerBotUseCase(repo as never);
      await expect(
        useCase.execute({ ids: ["shop-1"], enabled: true, reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.applyOwnerBotBatch).not.toHaveBeenCalled();
    });

    it("assistente individual recusa conta inexistente", async () => {
      const repo = shopRepo();
      repo.findById.mockResolvedValue(null);

      const useCase = new SetShopOwnerBotUseCase(repo as never);
      await expect(
        useCase.execute({ id: "shop-1", enabled: true, reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("lista salões normaliza owner bot e paginação", async () => {
      const repo = shopRepo();
      repo.list.mockResolvedValue({
        total: 1,
        shops: [
          {
            id: "shop-1",
            name: "Barbearia Central",
            city: "São Paulo",
            active: true,
            approvalStatus: "APPROVED",
            whatsappAiEnabled: true,
            evolutionInstanceName: "shop-1",
            createdAt: new Date(),
            OwnerBotPreference: null,
            _count: { aiConversations: 2, OwnerBotActionLog: 1 },
          },
        ],
      });

      const useCase = new ListWhatsAppShopsUseCase(repo as never);
      const result = await useCase.execute({ page: 1, limit: 20 });

      expect(result.data[0].ownerBot).toBeNull();
      expect(result.data[0].counts).toEqual({ aiConversations: 2, OwnerBotActionLog: 1 });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });
  });

  describe("conversas de IA", () => {
    it("lista mascarando o telefone", async () => {
      const repo = {
        list: vi.fn().mockResolvedValue({
          total: 1,
          conversations: [
            {
              id: "conv-1",
              barbershopId: "shop-1",
              phone: "11987654321",
              status: "OPEN",
              startedAt: new Date(),
              lastMessageAt: new Date(),
              endedAt: null,
              barbershop: { name: "Barbearia Central" },
              _count: { messages: 3 },
            },
          ],
        }),
      };

      const useCase = new ListAiConversationsUseCase(repo as never);
      const result = await useCase.execute({ page: 1, limit: 20 });

      expect(result.data[0].phoneMasked).toBe("(11) 98765-4321");
      expect(result.meta.totalPages).toBe(1);
    });

    it("detalhe recusa conversa inexistente", async () => {
      const repo = { findDetail: vi.fn().mockResolvedValue(null) };
      const useCase = new GetAiConversationUseCase(repo as never);
      await expect(useCase.execute("conv-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("transferência usa o salão da conversa na auditoria", async () => {
      const repo = {
        findSummary: vi.fn().mockResolvedValue({
          id: "conv-1",
          barbershopId: "shop-1",
          status: "OPEN",
          endedAt: null,
        }),
        transfer: vi.fn().mockResolvedValue({
          id: "conv-1",
          barbershopId: "shop-1",
          status: "TRANSFERRED_TO_HUMAN",
          endedAt: new Date(),
        }),
      };

      const useCase = new TransferAiConversationUseCase(repo as never);
      const result = await useCase.execute({ id: "conv-1", reason: REASON, userId: "admin-1" });

      expect(result.status).toBe("TRANSFERRED_TO_HUMAN");
      expect(repo.transfer).toHaveBeenCalledWith(
        expect.objectContaining({ id: "conv-1", barbershopId: "shop-1", reason: REASON, userId: "admin-1" })
      );
    });
  });

  it("logs do assistente mantêm o nome do salão", async () => {
    const repo = {
      list: vi.fn().mockResolvedValue({
        total: 1,
        logs: [
          {
            id: "log-1",
            barbershopId: "shop-1",
            action: "CREATE_APPOINTMENT",
            status: "SUCCESS",
            riskClass: "LOW",
            phoneMasked: "***4321",
            errorMessage: null,
            canUndo: false,
            undoneAt: null,
            createdAt: new Date(),
            barbershop: { name: "Barbearia Central" },
          },
        ],
      }),
    };

    const useCase = new ListOwnerBotActionLogsUseCase(repo as never);
    const result = await useCase.execute({ page: 1, limit: 20 });
    expect(result.data[0].barbershopName).toBe("Barbearia Central");
  });

  it("lista falhas de notificação calculando o reenvio", async () => {
    const repo = {
      listFailed: vi.fn().mockResolvedValue({ deliveries: [], outbox: [] }),
      findActiveSuppressions: vi.fn().mockResolvedValue([]),
      findDisabledPreferences: vi.fn().mockResolvedValue([]),
    };
    const settingsRepo = {
      get: vi.fn().mockResolvedValue({ outboundPaused: false }),
    };
    const useCase = new ListFailedWhatsAppNotificationsUseCase(repo as never, settingsRepo as never);
    await expect(useCase.execute()).resolves.toEqual({ deliveries: [], outbox: [] });
    expect(repo.listFailed).toHaveBeenCalled();
  });

  describe("filas", () => {
    it("mascara telefone dos jobs com falha", async () => {
      const gateway = {
        counts: vi.fn().mockResolvedValue({
          whatsapp: { available: true, wait: 0, active: 0, completed: 0, failed: 1, delayed: 0 },
        }),
        failedJobs: vi.fn().mockResolvedValue({
          whatsapp: {
            available: true,
            jobs: [
              {
                id: "1",
                name: "send",
                failedReason: "timeout",
                attemptsMade: 3,
                timestamp: 10,
                phone: "11987654321",
              },
            ],
          },
        }),
      };

      const useCase = new ListWhatsAppQueuesUseCase(gateway as never);
      const result = await useCase.execute();

      expect(result.failed.whatsapp.available).toBe(true);
      expect(result.failed.whatsapp.jobs?.[0].phoneMasked).toBe("(11) 98765-4321");
      expect(result.failed.whatsapp.jobs?.[0].failedReason).toBe("timeout");
    });

    it("marca fila indisponível quando a leitura falha", async () => {
      const gateway = {
        counts: vi.fn().mockResolvedValue({
          whatsapp: { available: false, error: "Fila indisponível" },
        }),
        failedJobs: vi.fn().mockResolvedValue({
          whatsapp: { available: false, error: "Fila indisponível" },
        }),
      };

      const useCase = new ListWhatsAppQueuesUseCase(gateway as never);
      const result = await useCase.execute();

      expect(result.counts.whatsapp).toEqual({ available: false, error: "Fila indisponível" });
      expect(result.failed.whatsapp.available).toBe(false);
      expect(result.failed.whatsapp.jobs).toBeUndefined();
    });

    it("reprocessar recusa fila inválida", async () => {
      const gateway = { getJobState: vi.fn(), retry: vi.fn() };
      const auditRepo = { create: vi.fn() };
      const useCase = new ReprocessWhatsAppJobUseCase(gateway as never, auditRepo as never);
      await expect(
        useCase.execute({ queue: "outros", jobId: "1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("reprocessar recusa job inexistente", async () => {
      const gateway = { getJobState: vi.fn().mockResolvedValue(null), retry: vi.fn() };
      const auditRepo = { create: vi.fn() };
      const useCase = new ReprocessWhatsAppJobUseCase(gateway as never, auditRepo as never);
      await expect(
        useCase.execute({ queue: "whatsapp", jobId: "1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("reprocessar recusa job que não está falho", async () => {
      const gateway = { getJobState: vi.fn().mockResolvedValue("active"), retry: vi.fn() };
      const auditRepo = { create: vi.fn() };
      const useCase = new ReprocessWhatsAppJobUseCase(gateway as never, auditRepo as never);
      await expect(
        useCase.execute({ queue: "whatsapp", jobId: "1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(gateway.retry).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("reprocessar job falho audita a ação", async () => {
      const gateway = {
        getJobState: vi.fn().mockResolvedValue("failed"),
        retry: vi.fn().mockResolvedValue(undefined),
      };
      const auditRepo = { create: vi.fn() };
      const useCase = new ReprocessWhatsAppJobUseCase(gateway as never, auditRepo as never);
      const result = await useCase.execute({
        queue: "whatsapp",
        jobId: "1",
        reason: REASON,
        userId: "admin-1",
      });

      expect(result.reprocessed).toBe(true);
      expect(gateway.retry).toHaveBeenCalledWith("whatsapp", "1");
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "WHATSAPP_QUEUE_REPROCESS", resourceId: "1" })
      );
    });

    it("limpar recusa fila inválida", async () => {
      const gateway = { getJobState: vi.fn(), remove: vi.fn() };
      const auditRepo = { create: vi.fn() };
      const useCase = new CleanWhatsAppJobUseCase(gateway as never, auditRepo as never);

      await expect(
        useCase.execute({ queue: "outros", jobId: "1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("limpar recusa job ativo", async () => {
      const gateway = { getJobState: vi.fn().mockResolvedValue("active"), remove: vi.fn() };
      const auditRepo = { create: vi.fn() };
      const useCase = new CleanWhatsAppJobUseCase(gateway as never, auditRepo as never);

      await expect(
        useCase.execute({ queue: "whatsapp", jobId: "1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(gateway.remove).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("limpar remove job falho e audita", async () => {
      const gateway = {
        getJobState: vi.fn().mockResolvedValue("failed"),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      const auditRepo = { create: vi.fn() };
      const useCase = new CleanWhatsAppJobUseCase(gateway as never, auditRepo as never);

      const result = await useCase.execute({
        queue: "whatsapp-ai",
        jobId: "2",
        reason: REASON,
        userId: "admin-1",
      });

      expect(result.removed).toBe(true);
      expect(gateway.remove).toHaveBeenCalledWith("whatsapp-ai", "2");
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "WHATSAPP_QUEUE_CLEAN" })
      );
    });
  });

  describe("overview e instâncias", () => {
    it("overview junta settings, contagens e filas", async () => {
      const settingsRepo = { get: vi.fn().mockResolvedValue({ outboundPaused: false }) };
      const overviewRepo = {
        countsSince: vi.fn().mockResolvedValue({
          aiConversationsTotal: 1,
          aiMessages24h: 2,
          ownerBotActions24h: 3,
          shopsWithAiEnabled: 4,
          shopsWithOwnerBotEnabled: 5,
        }),
      };
      const gateway = {
        counts: vi.fn().mockResolvedValue({
          whatsapp: { available: true, wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        }),
      };

      const useCase = new GetWhatsAppOverviewUseCase(
        settingsRepo as never,
        overviewRepo as never,
        gateway as never,
        async () => "open"
      );
      const result = await useCase.execute();

      expect(result.globalSettings).toEqual({ outboundPaused: false });
      expect(result.counts.aiConversationsTotal).toBe(1);
      expect(result.queues).toEqual({
        whatsapp: { available: true, wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
      });
    });

    it("reconectar devolve QR e audita", async () => {
      evolutionMocks.fetchEvolutionConnectionState.mockResolvedValue("close");
      evolutionMocks.fetchEvolutionQr.mockResolvedValue("data:image/png;base64,abc");

      const instanceRepo = {
        findShop: vi.fn().mockResolvedValue({
          id: "shop-1",
          name: "Barbearia Central",
          evolutionInstanceName: "shop-1",
        }),
      };
      const auditRepo = { create: vi.fn() };

      const useCase = new ReconnectWhatsAppInstanceUseCase(instanceRepo as never, auditRepo as never);
      const result = await useCase.execute({ shopId: "shop-1", reason: REASON, userId: "admin-1" });

      expect(result.qrcodeBase64).toBe("data:image/png;base64,abc");
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: "WHATSAPP_INSTANCE_RECONNECT" })
      );
    });

    it("reconectar recusa salão sem instância", async () => {
      const instanceRepo = {
        findShop: vi.fn().mockResolvedValue({
          id: "shop-1",
          name: "Barbearia Central",
          evolutionInstanceName: null,
        }),
      };
      const auditRepo = { create: vi.fn() };

      const useCase = new ReconnectWhatsAppInstanceUseCase(instanceRepo as never, auditRepo as never);
      await expect(
        useCase.execute({ shopId: "shop-1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("deslogar audita falha sem mascarar o erro", async () => {
      evolutionMocks.logoutEvolutionInstance.mockRejectedValue(new Error("redis fora"));

      const instanceRepo = {
        findShop: vi.fn().mockResolvedValue({
          id: "shop-1",
          name: "Barbearia Central",
          evolutionInstanceName: "shop-1",
        }),
      };
      const auditRepo = { create: vi.fn() };

      const useCase = new LogoutWhatsAppInstanceUseCase(instanceRepo as never, auditRepo as never);
      await expect(
        useCase.execute({ shopId: "shop-1", reason: REASON, userId: "admin-1" })
      ).rejects.toMatchObject({ statusCode: 502 });
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ details: expect.objectContaining({ status: "FAILED" }) })
      );
    });
  });
});
