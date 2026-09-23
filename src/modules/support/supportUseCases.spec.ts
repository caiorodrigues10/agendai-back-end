/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

const mockRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  listMine: vi.fn(),
  addComment: vi.fn(),
  addHistory: vi.fn(),
  createAdminNotification: vi.fn(),
  reactivateOnReply: vi.fn(),
};

vi.mock("./supportRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supportRepository")>();
  return {
    generateProtocol: actual.generateProtocol,
    SupportRepository: class {
      create = mockRepo.create;
      findById = mockRepo.findById;
      listMine = mockRepo.listMine;
      addComment = mockRepo.addComment;
      addHistory = mockRepo.addHistory;
      createAdminNotification = mockRepo.createAdminNotification;
      reactivateOnReply = mockRepo.reactivateOnReply;
    },
  };
});

import { SupportUseCases } from "./supportUseCases";
import { generateProtocol } from "./supportRepository";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const TICKET_ID = "00000000-0000-4000-8000-000000000003";

const reportInput = {
  title: "Erro ao agendar horário",
  description: "Ao confirmar o agendamento a tela fica em branco e nada é salvo.",
  category: "ERROR" as const,
  priority: "NORMAL" as const,
};

describe("SupportUseCases", () => {
  let useCases: SupportUseCases;

  beforeEach(() => {
    vi.clearAllMocks();
    useCases = new SupportUseCases();
    mockRepo.createAdminNotification.mockResolvedValue({ id: "notif-1" });
    mockRepo.addHistory.mockResolvedValue({ id: "hist-1" });
    mockRepo.reactivateOnReply.mockResolvedValue(null);
  });

  describe("protocol generation", () => {
    it("generates protocols matching AG-<base36 timestamp>-<6 hex chars>", () => {
      for (let i = 0; i < 25; i++) {
        expect(generateProtocol()).toMatch(/^AG-[A-Z0-9]+-[A-F0-9]+$/);
      }
    });
  });

  describe("createReport", () => {
    it("creates the ticket, writes a 'created' history entry and notifies admins", async () => {
      const createdTicket = {
        id: TICKET_ID,
        protocol: generateProtocol(),
        title: reportInput.title,
        description: reportInput.description,
        channel: "IN_APP",
        category: "ERROR",
        priority: "NORMAL",
        status: "OPEN",
        barbershopId: null,
        createdAt: new Date(),
        createdBy: { id: USER_ID, name: "Ana", email: "ana@example.com" },
      };
      mockRepo.create.mockResolvedValue(createdTicket);

      const result = await useCases.createReport(USER_ID, null, reportInput);

      expect(result.protocol).toMatch(/^AG-[A-Z0-9]+-[A-F0-9]+$/);
      expect(mockRepo.create).toHaveBeenCalledWith({
        ...reportInput,
        userId: USER_ID,
        barbershopId: null,
      });
      expect(mockRepo.addHistory).toHaveBeenCalledWith({
        ticketId: TICKET_ID,
        actorId: USER_ID,
        field: "created",
        oldValue: null,
        newValue: "OPEN",
      });
      expect(mockRepo.createAdminNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "CONTACT_MESSAGE",
          title: `Novo relatório: ${reportInput.title}`,
        })
      );
    });

    it("still creates the report if the admin notification fails", async () => {
      mockRepo.create.mockResolvedValue({
        id: TICKET_ID,
        protocol: generateProtocol(),
        description: reportInput.description,
        category: "ERROR",
        priority: "NORMAL",
        title: reportInput.title,
      });
      mockRepo.createAdminNotification.mockRejectedValue(new Error("redis down"));

      await expect(useCases.createReport(USER_ID, null, reportInput)).resolves.toMatchObject({
        id: TICKET_ID,
      });
      expect(mockRepo.addHistory).toHaveBeenCalled();
    });
  });

  describe("getMyReport ownership", () => {
    it("returns the report when the user owns it", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID });

      await expect(useCases.getMyReport(USER_ID, TICKET_ID)).resolves.toMatchObject({
        id: TICKET_ID,
      });
      expect(mockRepo.findById).toHaveBeenCalledWith(TICKET_ID);
    });

    it("throws 403 when a different user tries to read the report", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID });

      await expect(useCases.getMyReport(OTHER_USER_ID, TICKET_ID)).rejects.toMatchObject({
        statusCode: 403,
      } satisfies Partial<AppError>);
      await expect(useCases.getMyReport(OTHER_USER_ID, TICKET_ID)).rejects.toBeInstanceOf(AppError);
    });

    it("allows MASTER_ADMIN to read any report", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID });

      await expect(
        useCases.getMyReport(OTHER_USER_ID, TICKET_ID, "MASTER_ADMIN")
      ).resolves.toMatchObject({ id: TICKET_ID });
    });

    it("throws 404 when the report does not exist", async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(useCases.getMyReport(USER_ID, TICKET_ID)).rejects.toMatchObject({
        statusCode: 404,
      } satisfies Partial<AppError>);
    });
  });

  describe("addComment ownership", () => {
    it("throws 403 when commenting on someone else's report", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID });

      await expect(
        useCases.addComment(OTHER_USER_ID, TICKET_ID, "Olá, qual o status?")
      ).rejects.toMatchObject({ statusCode: 403 } satisfies Partial<AppError>);
      expect(mockRepo.addComment).not.toHaveBeenCalled();
    });

    it("creates a comment when the user owns the report", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID, status: "OPEN" });
      mockRepo.addComment.mockResolvedValue({ id: "c1", text: "Ainda ocorre" });
      mockRepo.reactivateOnReply.mockResolvedValue(null);

      await expect(
        useCases.addComment(USER_ID, TICKET_ID, "Ainda ocorre")
      ).resolves.toEqual({ id: "c1", text: "Ainda ocorre" });
      expect(mockRepo.addComment).toHaveBeenCalledWith(TICKET_ID, USER_ID, "Ainda ocorre");
      expect(mockRepo.reactivateOnReply).toHaveBeenCalledWith(TICKET_ID, "OPEN", USER_ID);
    });

    it("reactivates a WAITING_SHOP report when the owner replies", async () => {
      mockRepo.findById.mockResolvedValue({
        id: TICKET_ID,
        createdById: USER_ID,
        status: "WAITING_SHOP",
      });
      mockRepo.addComment.mockResolvedValue({ id: "c1", text: "Segue o print" });
      mockRepo.reactivateOnReply.mockResolvedValue({ id: TICKET_ID, status: "IN_PROGRESS" });

      await useCases.addComment(USER_ID, TICKET_ID, "Segue o print");

      expect(mockRepo.reactivateOnReply).toHaveBeenCalledWith(
        TICKET_ID,
        "WAITING_SHOP",
        USER_ID
      );
    });

    it("does not reactivate when a MASTER_ADMIN comments", async () => {
      mockRepo.findById.mockResolvedValue({
        id: TICKET_ID,
        createdById: USER_ID,
        status: "WAITING_SHOP",
      });
      mockRepo.addComment.mockResolvedValue({ id: "c2", text: "Pode nos enviar o print?" });

      await useCases.addComment(OTHER_USER_ID, TICKET_ID, "Pode nos enviar o print?", "MASTER_ADMIN");

      expect(mockRepo.reactivateOnReply).not.toHaveBeenCalled();
    });

    it("allows MASTER_ADMIN to comment on any report", async () => {
      mockRepo.findById.mockResolvedValue({ id: TICKET_ID, createdById: USER_ID });
      mockRepo.addComment.mockResolvedValue({ id: "c2", text: "Em análise" });

      await useCases.addComment(OTHER_USER_ID, TICKET_ID, "Em análise", "MASTER_ADMIN");
      expect(mockRepo.addComment).toHaveBeenCalledWith(TICKET_ID, OTHER_USER_ID, "Em análise");
    });
  });

  describe("listMyReports", () => {
    it("delegates to the repository with the user filter context", async () => {
      const page = { page: 1, limit: 10 } as const;
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      mockRepo.listMine.mockResolvedValue(expected);

      await expect(useCases.listMyReports(USER_ID, page)).resolves.toEqual(expected);
      expect(mockRepo.listMine).toHaveBeenCalledWith(USER_ID, page);
    });
  });
});
