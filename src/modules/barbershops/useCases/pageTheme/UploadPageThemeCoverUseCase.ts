import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import {
  COVER_IMAGE_SPEC,
  imageSpecFolder,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import { validateAndNormalizeImage } from "@/shared/utils/imageValidation";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";
import { assertOwnerShop } from "./GetPageThemeUseCase";

export interface IUploadPageThemeCoverDTO {
  barbershopId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

@injectable()
export class UploadPageThemeCoverUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
  ) {}

  async execute(
    data: IUploadPageThemeCoverDTO,
    requestingUser: { role: string; barbershopId?: string },
  ): Promise<IPageThemeDTO> {
    assertOwnerShop(requestingUser, data.barbershopId);

    const shop = await this.barbershopRepository.findById(data.barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);

    const existing = await this.barbershopRepository.findPageTheme(data.barbershopId);

    const validated = await validateAndNormalizeImage({
      buffer: data.buffer,
      declaredMimeType: data.mimeType,
      spec: COVER_IMAGE_SPEC,
    });

    const folder = imageSpecFolder(data.barbershopId, COVER_IMAGE_SPEC);
    const publicId = imageSpecPublicId(data.barbershopId, COVER_IMAGE_SPEC);

    const uploaded = await this.storageProvider.uploadBuffer(
      folder,
      COVER_IMAGE_SPEC.cloudinaryPublicId,
      validated.buffer,
      validated.mimeType,
      { overwrite: true, invalidate: true, publicId },
    );

    try {
      return await this.barbershopRepository.upsertPageTheme(data.barbershopId, {
        presetKey: existing?.presetKey ?? PAGE_THEME_DEFAULTS.presetKey,
        accentColor: existing?.accentColor ?? PAGE_THEME_DEFAULTS.accentColor,
        backgroundColor: existing?.backgroundColor ?? PAGE_THEME_DEFAULTS.backgroundColor,
        surfaceColor: existing?.surfaceColor ?? PAGE_THEME_DEFAULTS.surfaceColor,
        textColor: existing?.textColor ?? PAGE_THEME_DEFAULTS.textColor,
        textMutedColor: existing?.textMutedColor ?? PAGE_THEME_DEFAULTS.textMutedColor,
        radiusStyle: existing?.radiusStyle ?? PAGE_THEME_DEFAULTS.radiusStyle,
        buttonStyle: existing?.buttonStyle ?? PAGE_THEME_DEFAULTS.buttonStyle,
        coverOverlay: existing?.coverOverlay ?? PAGE_THEME_DEFAULTS.coverOverlay,
        coverUrl: uploaded.publicUrl,
        coverPublicId: uploaded.objectName,
      });
    } catch (err) {
      await this.storageProvider
        .deleteObject(uploaded.objectName)
        .catch(() => undefined);
      throw err;
    }
  }
}
