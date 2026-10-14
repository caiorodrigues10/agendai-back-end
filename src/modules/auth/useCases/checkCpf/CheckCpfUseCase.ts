import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { normalizeCpf, isValidCpf } from "@/shared/utils/cpfUtils";

export interface ICheckCpfResult {
  available: boolean;
}

/**
 * Disponibilidade do CPF para o cadastro (etapa 1 do wizard).
 *
 * Anti-enumeration: responde apenas `{ available }` — nunca diz se a conta é
 * de um terceiro, se está excluída, etc. CPF inválido também responde
 * `available: false` (sem 400), para não virar oráculo de validação.
 */
@injectable()
export class CheckCpfUseCase {
  async execute(rawCpf: string): Promise<ICheckCpfResult> {
    const cpf = normalizeCpf(rawCpf ?? "");
    if (!isValidCpf(cpf)) {
      return { available: false };
    }

    const existing = await prisma.user.findFirst({
      where: { cpf },
      select: { id: true },
    });

    return { available: !existing };
  }
}
