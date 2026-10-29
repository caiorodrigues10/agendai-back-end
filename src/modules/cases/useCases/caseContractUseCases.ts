import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { getFrontendUrl } from "@/shared/constants/env";
import { CaseBacklogRepository } from "../repositories/CaseBacklogRepository";
import type {
  ICaseContractDTO,
  IContractSignatureDTO,
} from "../dto/ICaseExtendedDTOs";
import type {
  AddContractSignerInput,
  CreateCaseContractInput,
  SendContractForSignatureInput,
  SignContractInput,
  UpdateCaseContractInput,
} from "../schemas/caseBacklogSchemas";
import type { RequestingUser } from "./caseManagementUseCases";

const STAFF_ROLES = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];

function assertStaffRole(user: RequestingUser): void {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new AppError(
      "Apenas profissionais do escritório podem gerenciar processos",
      403
    );
  }
}

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role === "MASTER_ADMIN") return;
  if (!user.barbershopId || user.barbershopId !== barbershopId) {
    throw new AppError(
      "Acesso negado: você não pertence a este escritório",
      403
    );
  }
}

/**
 * Contratos e procurações do caso — criação, edição, trilha de assinatura.
 *
 * Regra de sigilo: o conteúdo do contrato é interno do escritório; o link
 * público de assinatura expõe **apenas** o contrato e o nome do signatário.
 */
@injectable()
export class CreateCaseContractUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    input: CreateCaseContractInput,
    user: RequestingUser,
  ): Promise<ICaseContractDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const theCase = await this.repository.findCaseClient(barbershopId, caseId);
    if (!theCase) {
      throw new AppError("Caso não encontrado", 404);
    }

    return this.repository.createContract({
      barbershopId,
      caseId,
      clientId: theCase.clientId,
      title: input.title,
      type: input.type ?? "ENGAGEMENT",
      content: input.content ?? null,
      value: input.value ?? null,
      feePercent: input.feePercent ?? null,
      notes: input.notes ?? null,
      createdByUserId: user.id ?? null,
      signers: input.signers,
    });
  }
}

@injectable()
export class ListCaseContractsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { caseId?: string; status?: "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "SIGNED" | "VOID"; limit?: number },
    user: RequestingUser,
  ): Promise<ICaseContractDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listContracts(barbershopId, filters);
  }
}

@injectable()
export class UpdateCaseContractUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    contractId: string,
    input: UpdateCaseContractInput,
    user: RequestingUser,
  ): Promise<ICaseContractDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const existing = await this.repository.findContract(barbershopId, contractId);
    if (!existing) {
      throw new AppError("Contrato não encontrado", 404);
    }

    return this.repository.updateContract(barbershopId, contractId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.feePercent !== undefined ? { feePercent: input.feePercent } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
      ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
      ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
      ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
    });
  }
}

@injectable()
export class AddContractSignerUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    contractId: string,
    input: AddContractSignerInput,
    user: RequestingUser,
  ): Promise<IContractSignatureDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const contract = await this.repository.findContract(barbershopId, contractId);
    if (!contract) {
      throw new AppError("Contrato não encontrado", 404);
    }

    return this.repository.addSignature({
      barbershopId,
      contractId,
      signerName: input.signerName,
      signerEmail: input.signerEmail ?? null,
      signerWhatsapp: input.signerWhatsapp ?? null,
      role: input.role,
    });
  }
}

/**
 * Envio do contrato para assinatura.
 *
 * Gera/expõe o link de assinatura de cada signatário e dispara o WhatsApp
 * quando há número. O link é público, mas carrega token aleatório: quem não
 * tem o link não consegue assinar.
 */
@injectable()
export class SendContractForSignatureUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    contractId: string,
    input: SendContractForSignatureInput,
    user: RequestingUser,
  ): Promise<{ contract: ICaseContractDTO; links: Array<{ signerName: string; url: string }> }> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const contract = await this.repository.findContract(barbershopId, contractId);
    if (!contract) {
      throw new AppError("Contrato não encontrado", 404);
    }
    if (contract.status === "SIGNED") {
      throw new AppError("Contrato já está assinado", 409);
    }

    const signatures = await this.repository.listSignatures(barbershopId, contractId);
    if (signatures.length === 0) {
      throw new AppError(
        "Adicione ao menos um signatário antes de enviar para assinatura",
        400
      );
    }

    const updated = await this.repository.updateContract(barbershopId, contractId, {
      status: "SENT",
    });

    const frontendUrl = getFrontendUrl();
    const links: Array<{ signerName: string; url: string }> = [];

    for (const signature of signatures) {
      const token = await this.repository.signatureTokenOf(signature.id);
      if (!token) continue;
      const url = `${frontendUrl}/assinar/${token}`;
      links.push({ signerName: signature.signerName, url });

      if (signature.signerWhatsapp?.trim()) {
        const message = [
          `Olá, ${signature.signerName}!`,
          `O escritório enviou o documento "${contract.title}" para sua assinatura.`,
          input.message?.trim() ? input.message.trim() : "",
          `Assine pelo link: ${url}`,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          await enqueueWhatsApp({
            phone: signature.signerWhatsapp.trim(),
            message,
            notificationType: "CASE_CONTRACT_SIGNATURE",
            barbershopId,
            sourceType: "CASE_CONTRACT",
            sourceId: contractId,
          });
        } catch {
          // Falha no envio não invalida o link: o escritório pode compartilhar
          // o link por outro canal.
        }
      }
    }

    return { contract: updated, links };
  }
}

/**
 * Assinatura pública pelo link (sem login de escritório).
 *
 * O token é a credencial. Ao assinar, o status do contrato é recalculado:
 * todos assinados → SIGNED; alguns → PARTIALLY_SIGNED.
 */
@injectable()
export class SignContractUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    token: string,
    input: SignContractInput
  ): Promise<{ contractId: string; signedAt: Date }> {
    const signature = await this.repository.findSignatureByToken(token);
    if (!signature) {
      throw new AppError("Link de assinatura inválido", 404);
    }
    if (signature.status === "SIGNED") {
      throw new AppError("Esta assinatura já foi registrada", 409);
    }
    if (signature.status === "DECLINED") {
      throw new AppError("Esta assinatura foi recusada", 409);
    }

    const signedAt = new Date();
    await this.repository.updateSignature(signature.id, {
      status: "SIGNED",
      signedAt,
      signatureUrl: input.drawnSignature ?? null,
      signatureType: input.drawnSignature ? "DRAWN" : "TYPED",
    });

    await this.repository.refreshContractStatus(
      signature.barbershopId,
      signature.contractId
    );

    return { contractId: signature.contractId, signedAt };
  }
}

/** Recusa de assinatura pelo link público. */
@injectable()
export class DeclineContractUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(token: string, _input: { reason?: string | null }): Promise<void> {
    const signature = await this.repository.findSignatureByToken(token);
    if (!signature) {
      throw new AppError("Link de assinatura inválido", 404);
    }
    if (signature.status === "SIGNED") {
      throw new AppError("Esta assinatura já foi registrada", 409);
    }
    await this.repository.updateSignature(signature.id, {
      status: "DECLINED",
      signedAt: new Date(),
    });
    await this.repository.refreshContractStatus(
      signature.barbershopId,
      signature.contractId
    );
  }
}

/**
 * Dados públicos do contrato para a página de assinatura.
 *
 * Exibe apenas o título, o tipo, o conteúdo e o nome do signatário —
 * nunca o número do processo, o apelido interno ou dados do cliente.
 */
@injectable()
export class GetPublicContractUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(token: string): Promise<{
    contractTitle: string;
    contractType: string;
    content: string | null;
    fileUrl: string | null;
    signerName: string;
    status: string;
    signedAt: Date | null;
  }> {
    const signature = await this.repository.findSignatureByToken(token);
    if (!signature) {
      throw new AppError("Link de assinatura inválido", 404);
    }
    const contract = await this.repository.findContract(
      signature.barbershopId,
      signature.contractId
    );
    if (!contract) {
      throw new AppError("Contrato não encontrado", 404);
    }

    return {
      contractTitle: contract.title,
      contractType: contract.type,
      content: contract.content,
      fileUrl: contract.fileUrl,
      signerName: signature.signerName,
      status: signature.status,
      signedAt: signature.signedAt,
    };
  }
}
