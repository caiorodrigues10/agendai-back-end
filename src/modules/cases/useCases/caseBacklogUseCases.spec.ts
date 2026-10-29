import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateCaseContractUseCase,
  SignContractUseCase,
  GetPublicContractUseCase,
} from "./caseContractUseCases";
import {
  CreateSuccessFeeUseCase,
  CreateCaseTransferUseCase,
  RespondCaseTransferUseCase,
  TriageIntimationUseCase,
  IssueFeeInvoiceUseCase,
} from "./caseBacklogUseCases";
import { ListClientPortalCasesUseCase } from "./deadlineAlertUseCases";
import type { CaseBacklogRepository } from "../repositories/CaseBacklogRepository";

const SHOP = "shop-1";
const OTHER_SHOP = "shop-2";
const CASE_ID = "case-1";
const CLIENT_ID = "client-1";

const owner = { id: "user-1", role: "OWNER", barbershopId: SHOP };
const outsider = { id: "user-2", role: "OWNER", barbershopId: OTHER_SHOP };
const client = { id: "client-1", role: "CLIENT" as const };

function makeRepo(overrides: Partial<CaseBacklogRepository> = {}) {
  return {
    findCaseClient: vi.fn(async () => ({
      id: CASE_ID,
      clientId: CLIENT_ID,
      nickname: "Ação de cobrança",
    })),
    createContract: vi.fn(async (data: any) => ({
      id: "contract-1",
      barbershopId: SHOP,
      caseId: CASE_ID,
      clientId: CLIENT_ID,
      clientName: "Cliente Teste",
      title: data.title,
      type: data.type,
      status: "DRAFT" as const,
      content: null,
      fileUrl: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      version: 1,
      value: null,
      feePercent: null,
      notes: null,
      signedAt: null,
      createdByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      signatures: [],
      pendingSignatures: 0,
    })),
    findContract: vi.fn(async () => null),
    listContracts: vi.fn(async () => []),
    updateContract: vi.fn(async () => null),
    deleteContract: vi.fn(async () => undefined),
    addSignature: vi.fn(async () => null),
    findSignatureByToken: vi.fn(async () => null),
    listSignatures: vi.fn(async () => []),
    updateSignature: vi.fn(async () => null),
    refreshContractStatus: vi.fn(async () => null),
    signatureTokenOf: vi.fn(async () => "token-1"),
    createTimeEntry: vi.fn(async () => null),
    listTimeEntries: vi.fn(async () => []),
    updateTimeEntry: vi.fn(async () => null),
    deleteTimeEntry: vi.fn(async () => undefined),
    summarizeTimeEntries: vi.fn(async () => ({
      totalMinutes: 0,
      billableMinutes: 0,
      billableAmount: 0,
      unbilledAmount: 0,
      entryCount: 0,
    })),
    createSuccessFee: vi.fn(async (data: any) => ({
      id: "fee-1",
      barbershopId: SHOP,
      caseId: CASE_ID,
      caseName: null,
      percent: data.percent,
      baseAmount: null,
      amount: null,
      installments: data.installments ?? 1,
      status: "PENDING" as const,
      dueDate: null,
      paidAt: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    listSuccessFees: vi.fn(async () => []),
    findSuccessFee: vi.fn(async () => null),
    updateSuccessFee: vi.fn(async () => null),
    recalculateSuccessFee: vi.fn(async () => null),
    createIntimation: vi.fn(async (data: any) => ({
      id: "intimation-1",
      barbershopId: SHOP,
      caseId: null,
      caseName: null,
      source: data.source,
      receivedAt: new Date(),
      subject: data.subject,
      body: data.body,
      detectedNumber: data.detectedNumber ?? null,
      suggestedType: data.suggestedType ?? ("INTIMATION" as const),
      status: "NEW" as const,
      triagedAt: null,
      linkedEventId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    listIntimations: vi.fn(async () => []),
    findIntimation: vi.fn(async () => null),
    updateIntimation: vi.fn(async () => null),
    findCaseByNumber: vi.fn(async () => null),
    createFeeInvoice: vi.fn(async (data: any) => ({
      id: "invoice-1",
      barbershopId: SHOP,
      caseId: null,
      clientId: null,
      invoiceNumber: null,
      externalId: null,
      provider: data.provider ?? ("MANUAL" as const),
      status: "DRAFT" as const,
      description: data.description,
      amount: data.amount,
      issRetained: false,
      taxpayerId: null,
      issuedAt: null,
      xmlUrl: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    listFeeInvoices: vi.fn(async () => []),
    findFeeInvoice: vi.fn(async () => null),
    updateFeeInvoice: vi.fn(async () => null),
    deleteFeeInvoice: vi.fn(async () => undefined),
    listDeadlineAlerts: vi.fn(async () => []),
    createDeadlineAlert: vi.fn(async () => null),
    findDeadlineAlert: vi.fn(async () => null),
    updateDeadlineAlert: vi.fn(async () => undefined),
    findDeadlinesNeedingAlert: vi.fn(async () => []),
    createTransfer: vi.fn(async () => null),
    listTransfers: vi.fn(async () => []),
    findTransfer: vi.fn(async () => null),
    updateTransfer: vi.fn(async () => null),
    moveCaseToShop: vi.fn(async () => undefined),
    listSiblingShops: vi.fn(async () => [
      { id: OTHER_SHOP, name: "Unidade B" },
    ]),
    listClientPortalCasesByIdentity: vi.fn(async () => []),
    ...overrides,
  } as unknown as CaseBacklogRepository;
}

describe("gestão de processos — backlog", () => {
  let repo: CaseBacklogRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  // ─── Contratos ────────────────────────────────────────────────────────────

  describe("contratos", () => {
    it("cria contrato resolvendo o cliente a partir do caso", async () => {
      const useCase = new CreateCaseContractUseCase(repo);
      const contract = await useCase.execute(
        SHOP,
        CASE_ID,
        { title: "Contrato de honorários", signers: [{ signerName: "Cliente" }] },
        owner
      );

      expect(repo.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: CLIENT_ID, caseId: CASE_ID })
      );
      expect(contract.title).toBe("Contrato de honorários");
    });

    it("recusa contrato de caso de outro escritório", async () => {
      const useCase = new CreateCaseContractUseCase(repo);
      await expect(
        useCase.execute(
          OTHER_SHOP,
          CASE_ID,
          { title: "Contrato", signers: [{ signerName: "Cliente" }] },
          owner
        )
      ).rejects.toThrow(/pertence a este escritório/);
    });

    it("recusa o envio do contrato quando não há signatário", async () => {
      const { SendContractForSignatureUseCase } = await import(
        "./caseContractUseCases"
      );
      const sendRepo = makeRepo({
        findContract: vi.fn(async () => ({
          id: "contract-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          clientId: CLIENT_ID,
          clientName: null,
          title: "Contrato",
          type: "ENGAGEMENT" as const,
          status: "DRAFT" as const,
          content: null,
          fileUrl: null,
          fileName: null,
          mimeType: null,
          sizeBytes: null,
          version: 1,
          value: null,
          feePercent: null,
          notes: null,
          signedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          signatures: [],
          pendingSignatures: 0,
        })),
        listSignatures: vi.fn(async () => []),
      });

      const useCase = new SendContractForSignatureUseCase(sendRepo);
      await expect(
        useCase.execute(SHOP, "contract-1", {}, owner)
      ).rejects.toThrow(/signatário/i);
    });
  });

  // ─── Assinatura ───────────────────────────────────────────────────────────

  describe("assinatura pública", () => {
    it("assina com token válido e recalcula o status do contrato", async () => {
      const signedAt = new Date();
      const signedRepo = makeRepo({
        findSignatureByToken: vi.fn(async () => ({
          id: "sig-1",
          barbershopId: SHOP,
          contractId: "contract-1",
          signerName: "Cliente",
          signerEmail: null,
          signerWhatsapp: null,
          role: "CLIENT" as const,
          status: "PENDING" as const,
          signatureUrl: null,
          signatureType: "TYPED" as const,
          signedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        updateSignature: vi.fn(async () => ({
          id: "sig-1",
          barbershopId: SHOP,
          contractId: "contract-1",
          signerName: "Cliente",
          signerEmail: null,
          signerWhatsapp: null,
          role: "CLIENT" as const,
          status: "SIGNED" as const,
          signatureUrl: null,
          signatureType: "TYPED" as const,
          signedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new SignContractUseCase(signedRepo);
      const result = await useCase.execute("token-1", { typedName: "Cliente" });

      expect(signedRepo.updateSignature).toHaveBeenCalledWith(
        "sig-1",
        expect.objectContaining({ status: "SIGNED", signatureType: "TYPED" })
      );
      expect(signedRepo.refreshContractStatus).toHaveBeenCalledWith(
        SHOP,
        "contract-1"
      );
      expect(result.contractId).toBe("contract-1");
      expect(result.signedAt).toBeInstanceOf(Date);
      expect(signedAt).toBeInstanceOf(Date);
    });

    it("recusa assinatura sem token", async () => {
      const useCase = new SignContractUseCase(repo);
      await expect(
        useCase.execute("invalido", { typedName: "Fulano" })
      ).rejects.toThrow(/inválido/);
    });

    it("não expõe número de processo nem apelido no documento público", async () => {
      const publicRepo = makeRepo({
        findSignatureByToken: vi.fn(async () => ({
          id: "sig-1",
          barbershopId: SHOP,
          contractId: "contract-1",
          signerName: "Cliente",
          signerEmail: null,
          signerWhatsapp: null,
          role: "CLIENT" as const,
          status: "PENDING" as const,
          signatureUrl: null,
          signatureType: "TYPED" as const,
          signedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        findContract: vi.fn(async () => ({
          id: "contract-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          clientId: CLIENT_ID,
          clientName: "Cliente Teste",
          title: "Contrato de honorários",
          type: "ENGAGEMENT" as const,
          status: "SENT" as const,
          content: "Cláusulas do contrato",
          fileUrl: null,
          fileName: null,
          mimeType: null,
          sizeBytes: null,
          version: 1,
          value: null,
          feePercent: null,
          notes: "observação interna",
          signedAt: null,
          createdByUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          signatures: [],
          pendingSignatures: 0,
        })),
      });

      const useCase = new GetPublicContractUseCase(publicRepo);
      const contract = await useCase.execute("token-1");

      expect(contract).not.toHaveProperty("caseNumber");
      expect(contract).not.toHaveProperty("nickname");
      expect(contract).not.toHaveProperty("notes");
      expect((contract as Record<string, unknown>).title).toBeUndefined();
      expect(contract.contractTitle).toBe("Contrato de honorários");
    });
  });

  // ─── Honorários de êxito ──────────────────────────────────────────────────

  describe("honorários de êxito", () => {
    it("recalcula o honorário a partir do valor obtido no caso", async () => {
      const feeRepo = makeRepo({
        recalculateSuccessFee: vi.fn(async () => ({
          id: "fee-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          caseName: null,
          percent: 20,
          baseAmount: 50000,
          amount: 10000,
          installments: 2,
          status: "PENDING" as const,
          dueDate: null,
          paidAt: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new CreateSuccessFeeUseCase(feeRepo);
      const fee = await useCase.execute(
        SHOP,
        CASE_ID,
        { percent: 20, installments: 2 },
        owner
      );

      expect(feeRepo.recalculateSuccessFee).toHaveBeenCalledWith(SHOP, "fee-1");
      expect(fee.amount).toBe(10000);
      expect(fee.installments).toBe(2);
    });
  });

  // ─── Digestão de intimações ───────────────────────────────────────────────

  describe("intimações", () => {
    it("detecta o número do processo e sugere o tipo do andamento", async () => {
      const intimationRepo = makeRepo();
      const { CreateIntimationUseCase } = await import("./caseBacklogUseCases");
      const useCase = new CreateIntimationUseCase(intimationRepo);

      await useCase.execute(
        SHOP,
        {
          subject: "Intimação",
          body: "Processo 1234567-89.2026.8.26.0100 — audiência designada para 12/11.",
        },
        owner
      );

      expect(intimationRepo.createIntimation).toHaveBeenCalledWith(
        expect.objectContaining({
          detectedNumber: "1234567-89.2026.8.26.0100",
          suggestedType: "MEETING",
        })
      );
    });

    it("vincula a intimação ao caso pelo número detectado", async () => {
      const triageRepo = makeRepo({
        findIntimation: vi.fn(async () => ({
          id: "intimation-1",
          barbershopId: SHOP,
          caseId: null,
          caseName: null,
          source: "IMPORT" as const,
          receivedAt: new Date(),
          subject: "Intimação",
          body: "corpo",
          detectedNumber: "1234567-89.2026.8.26.0100",
          suggestedType: "INTIMATION" as const,
          status: "NEW" as const,
          triagedAt: null,
          linkedEventId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        findCaseByNumber: vi.fn(async () => ({
          id: CASE_ID,
          nickname: "Ação de cobrança",
        })),
        updateIntimation: vi.fn(async () => ({
          id: "intimation-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          caseName: null,
          source: "IMPORT" as const,
          receivedAt: new Date(),
          subject: "Intimação",
          body: "corpo",
          detectedNumber: "1234567-89.2026.8.26.0100",
          suggestedType: "INTIMATION" as const,
          status: "LINKED" as const,
          triagedAt: new Date(),
          linkedEventId: "event-1",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new TriageIntimationUseCase(triageRepo);
      const createEvent = vi.fn(async () => "event-1");

      const result = await useCase.execute(
        SHOP,
        "intimation-1",
        { createEvent: true },
        createEvent,
        owner
      );

      expect(triageRepo.findCaseByNumber).toHaveBeenCalledWith(
        SHOP,
        "1234567-89.2026.8.26.0100"
      );
      expect(createEvent).toHaveBeenCalled();
      expect(result.caseId).toBe(CASE_ID);
      expect(result.status).toBe("LINKED");
    });
  });

  // ─── NFS-e ────────────────────────────────────────────────────────────────

  describe("NFS-e", () => {
    it("emite nota manual com o número informado", async () => {
      const invoiceRepo = makeRepo({
        findFeeInvoice: vi.fn(async () => ({
          id: "invoice-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          clientId: CLIENT_ID,
          invoiceNumber: null,
          externalId: null,
          provider: "MANUAL" as const,
          status: "DRAFT" as const,
          description: "Honorários",
          amount: 1500,
          issRetained: false,
          taxpayerId: null,
          issuedAt: null,
          xmlUrl: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        updateFeeInvoice: vi.fn(async () => ({
          id: "invoice-1",
          barbershopId: SHOP,
          caseId: CASE_ID,
          clientId: CLIENT_ID,
          invoiceNumber: "NFS-001",
          externalId: null,
          provider: "MANUAL" as const,
          status: "ISSUED" as const,
          description: "Honorários",
          amount: 1500,
          issRetained: false,
          taxpayerId: null,
          issuedAt: new Date(),
          xmlUrl: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new IssueFeeInvoiceUseCase(invoiceRepo);
      const invoice = await useCase.execute(
        SHOP,
        "invoice-1",
        { invoiceNumber: "NFS-001" },
        owner
      );

      expect(invoice.status).toBe("ISSUED");
      expect(invoice.invoiceNumber).toBe("NFS-001");
    });

    it("marca a nota como falha quando o provedor externo não está configurado", async () => {
      const invoiceRepo = makeRepo({
        findFeeInvoice: vi.fn(async () => ({
          id: "invoice-1",
          barbershopId: SHOP,
          caseId: null,
          clientId: null,
          invoiceNumber: null,
          externalId: null,
          provider: "NFE_IO" as const,
          status: "DRAFT" as const,
          description: "Honorários",
          amount: 1500,
          issRetained: false,
          taxpayerId: null,
          issuedAt: null,
          xmlUrl: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        updateFeeInvoice: vi.fn(async () => ({
          id: "invoice-1",
          barbershopId: SHOP,
          caseId: null,
          clientId: null,
          invoiceNumber: null,
          externalId: null,
          provider: "NFE_IO" as const,
          status: "FAILED" as const,
          description: "Honorários",
          amount: 1500,
          issRetained: false,
          taxpayerId: null,
          issuedAt: null,
          xmlUrl: null,
          errorMessage: "sem credencial",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new IssueFeeInvoiceUseCase(invoiceRepo);
      await expect(
        useCase.execute(SHOP, "invoice-1", {}, owner)
      ).rejects.toThrow(/NFE\.io/);

      expect(invoiceRepo.updateFeeInvoice).toHaveBeenCalledWith(
        SHOP,
        "invoice-1",
        expect.objectContaining({ status: "FAILED" })
      );
    });
  });

  // ─── Transferência entre unidades ─────────────────────────────────────────

  describe("transferência entre unidades", () => {
    it("recusa destino fora da mesma organização", async () => {
      const useCase = new CreateCaseTransferUseCase(repo);
      await expect(
        useCase.execute(
          SHOP,
          CASE_ID,
          { targetBarbershopId: "shop-externo" },
          owner
        )
      ).rejects.toThrow(/unidade de destino/i);
    });

    it("move o caso quando a unidade de destino aceita", async () => {
      const transferRepo = makeRepo({
        findTransfer: vi.fn(async () => ({
          id: "transfer-1",
          barbershopId: SHOP,
          originName: "Unidade A",
          caseId: CASE_ID,
          caseName: "Ação de cobrança",
          targetBarbershopId: OTHER_SHOP,
          targetName: "Unidade B",
          reason: null,
          status: "PENDING" as const,
          requestedByUserId: "user-1",
          acceptedByUserId: null,
          acceptedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new RespondCaseTransferUseCase(transferRepo);
      await useCase.execute(
        OTHER_SHOP,
        "transfer-1",
        { decision: "ACCEPTED" },
        { id: "user-2", role: "OWNER", barbershopId: OTHER_SHOP }
      );

      expect(transferRepo.moveCaseToShop).toHaveBeenCalledWith(
        CASE_ID,
        SHOP,
        OTHER_SHOP
      );
    });

    it("recusa resposta de quem não é a unidade de destino", async () => {
      const transferRepo = makeRepo({
        findTransfer: vi.fn(async () => ({
          id: "transfer-1",
          barbershopId: SHOP,
          originName: "Unidade A",
          caseId: CASE_ID,
          caseName: null,
          targetBarbershopId: OTHER_SHOP,
          targetName: "Unidade B",
          reason: null,
          status: "PENDING" as const,
          requestedByUserId: "user-1",
          acceptedByUserId: null,
          acceptedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      });

      const useCase = new RespondCaseTransferUseCase(transferRepo);
      await expect(
        useCase.execute(
          SHOP,
          "transfer-1",
          { decision: "ACCEPTED" },
          owner
        )
      ).rejects.toThrow(/unidade de destino/);
    });
  });

  // ─── Portal do cliente ────────────────────────────────────────────────────

  describe("portal do cliente", () => {
    it("devolve os casos compartilhados pela identidade", async () => {
      const portalRepo = makeRepo({
        listClientPortalCasesByIdentity: vi.fn(async () => [
          {
            id: CASE_ID,
            barbershopId: SHOP,
            barbershopName: "Escritório",
            label: "Cível",
            status: "ACTIVE",
            practiceArea: "Cível",
            nextAppointment: null,
            sharedEvents: [],
            pendingSignatures: [],
          },
        ]),
      });

      const useCase = new ListClientPortalCasesUseCase(portalRepo);
      const cases = await useCase.execute("identity-1", 20);

      expect(portalRepo.listClientPortalCasesByIdentity).toHaveBeenCalledWith(
        "identity-1",
        20
      );
      expect(cases[0].label).toBe("Cível");
      expect(cases[0]).not.toHaveProperty("caseNumber");
      expect(cases[0]).not.toHaveProperty("nickname");
      expect(client.role).toBe("CLIENT");
    });
  });
});
