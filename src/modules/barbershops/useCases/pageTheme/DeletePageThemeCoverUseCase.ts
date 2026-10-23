import { inject, injectable } from "tsyringe";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import {
  COVER_IMAGE_SPEC,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";
import { assertOwnerShop } from "./GetPageThemeUseCase";

const logger = getModuleLogger("barbershops:page-theme");

@injectable()
export class DeletePageThemeCoverUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
  ) {}

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string },
  ): Promise<IPageThemeDTO | null> {
    assertOwnerShop(requestingUser, barbershopId);

    const existing = await this.barbershopRepository.findPageTheme(barbershopId);
    if (!existing) return null;

    if (existing.coverPublicId) {
      // Só destrói o asset se o publicId pertencer à pasta DESTE salão
      // (mesma fórmula do confirm). Linha corrompida apontando para o
      // publicId de outro salão nunca apaga a capa real vizinha.
      const expectedPublicId = imageSpecPublicId(barbershopId, COVER_IMAGE_SPEC);
      if (existing.coverPublicId === expectedPublicId) {
        await this.storageProvider
          .deleteObject(existing.coverPublicId)
          .catch(() => undefined);
      } else {
        logger.warn(
          { barbershopId, coverPublicId: existing.coverPublicId },
          "deleteCover: publicId fora da pasta do salão — asset NÃO destruído",
        );
      }
    }

    return this.barbershopRepository.upsertPageTheme(barbershopId, {
      presetKey: existing.presetKey ?? PAGE_THEME_DEFAULTS.presetKey,
      accentColor: existing.accentColor,
      backgroundColor: existing.backgroundColor,
      surfaceColor: existing.surfaceColor,
      textColor: existing.textColor,
      textMutedColor: existing.textMutedColor,
      radiusStyle: existing.radiusStyle,
      buttonStyle: existing.buttonStyle,
      coverOverlay: existing.coverOverlay,
      coverUrl: null,
      coverPublicId: null,
      coverWidth: null,
      coverHeight: null,
      // Sem capa não há enquadramento — volta ao centro (50% · 50%).
      coverFocalX: 50,
      coverFocalY: 50,
    });
  }
}
