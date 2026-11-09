import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IUserRepository } from "../../repositories/IUserRepository";
import type { IListTeamQuery, IUserListResult } from "../../dtos/IUserListDTO";

/**
 * Listagem da equipe do dono (`GET /api/users`).
 *
 * O salão vem do contexto (primeiro argumento), nunca da query: o dono só vê
 * a própria equipe e o MASTER_ADMIN precisa informar o salão explicitamente.
 */
@injectable()
export class ListTeamUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
  ) {}

  async execute(
    barbershopId: string,
    query: IListTeamQuery,
    requestingUser: { role: string; barbershopId?: string | null },
  ): Promise<IUserListResult> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.userRepository.list(barbershopId, query);
  }
}
