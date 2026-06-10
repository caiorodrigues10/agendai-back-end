import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

export interface IConfirmLogoDTO {
  barbershopId: string;
  /** URL pública retornada pelo GetLogoUploadUrlUseCase */
  logoUrl: string;
}

@injectable()
export class ConfirmLogoUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) { }

  async execute(
    data: IConfirmLogoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IBarbershopResponseDTO> {
    // Autorização: OWNER só pode alterar a própria barbearia
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError(
        "Acesso negado: você não pertence a esta barbearia",
        403
      );
    }

    const barbershop = await this.barbershopRepository.findById(
      data.barbershopId
    );
    if (!barbershop) {
      throw new AppError("Barbearia não encontrada", 404);
    }

    // Valida que a URL pertence ao nosso bucket (evita injeção de URL externa)
    const objectName = this.storageProvider.extractObjectName(data.logoUrl);
    if (!objectName) {
      throw new AppError(
        "logoUrl inválida: a URL deve pertencer ao bucket de assets da plataforma",
        400
      );
    }

    // Só aceita logos na pasta correta
    if (!objectName.startsWith("logos/")) {
      throw new AppError(
        "logoUrl inválida: o arquivo deve estar na pasta de logos",
        400
      );
    }

    // Se já tinha logo antiga, deleta do GCS para não acumular objetos órfãos
    if (barbershop.logoUrl) {
      const oldObjectName = this.storageProvider.extractObjectName(
        barbershop.logoUrl
      );
      if (oldObjectName) {
        // Fire-and-forget — falha na deleção da logo antiga não deve bloquear a atualização
        this.storageProvider
          .deleteObject(oldObjectName)
          .catch((err) =>
            console.warn(
              `[ConfirmLogo] Falha ao deletar logo antiga (${oldObjectName}):`,
              err?.message
            )
          );
      }
    }

    return this.barbershopRepository.update(data.barbershopId, {
      logoUrl: data.logoUrl,
    });
  }
}