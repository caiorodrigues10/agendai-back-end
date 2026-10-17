import { inject, injectable } from "tsyringe";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";
import { assertOwnerShop } from "./GetPageThemeUseCase";

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
      await this.storageProvider
        .deleteObject(existing.coverPublicId)
        .catch(() => undefined);
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
    });
  }
}
