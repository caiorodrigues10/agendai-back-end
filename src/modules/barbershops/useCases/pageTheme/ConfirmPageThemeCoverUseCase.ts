import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import {
  COVER_IMAGE_SPEC,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import {
  destroyCloudinaryImage,
  fetchCloudinaryImageResource,
} from "@/shared/utils/cloudinaryAdmin";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";
import { assertOwnerShop } from "./GetPageThemeUseCase";

const logger = getModuleLogger("barbershops:page-theme");

export interface IConfirmPageThemeCoverDTO {
  barbershopId: string;
  publicId: string;
  /** version retornado pelo upload direto (staleness check). */
  version?: number;
}

/**
 * Confirma a capa enviada DIRETAMENTE ao Cloudinary.
 * O back é a autoridade: consulta o recurso no Cloudinary e só grava se
 * pasta/formato batirem com COVER_IMAGE_SPEC (a capa aceita QUALQUER medida —
 * `coverWidth/coverHeight` são apenas o original p/ o front recortar sem
 * ampliar). Asset fora do padrão é destruído para não sobrar lixo.
 */
@injectable()
export class ConfirmPageThemeCoverUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
  ) {}

  async execute(
    data: IConfirmPageThemeCoverDTO,
    requestingUser: { role: string; barbershopId?: string },
  ): Promise<IPageThemeDTO> {
    assertOwnerShop(requestingUser, data.barbershopId);

    const spec = COVER_IMAGE_SPEC;
    const expectedPublicId = imageSpecPublicId(data.barbershopId, spec);
    if (data.publicId !== expectedPublicId) {
      throw new AppError("publicId inválido para a capa deste salão.", 400);
    }

    const resource = await fetchCloudinaryImageResource(expectedPublicId);
    if (!resource) {
      throw new AppError("Imagem não encontrada no Cloudinary. Envie o arquivo novamente.", 404);
    }

    // Pasta: a API de resource do Cloudinary NÃO devolve `folder` (o campo
    // retornado é `asset_folder`, apenas em listagens) — comparar
    // `resource.folder` (null) falhava sempre e rejeitava QUALQUER arquivo
    // válido com a mensagem de formato. A pasta fica garantida por
    // `data.publicId === expectedPublicId` acima: o resource é buscado por
    // `imageSpecFolder(...)/cover`.
    const format = (resource.format ?? "").toLowerCase();
    const formatOk = spec.allowedFormats.includes(
      (format === "jpg" ? "jpeg" : format) as "jpeg" | "png" | "webp",
    );
    const versionOk = data.version === undefined || resource.version === data.version;

    if (!formatOk) {
      await destroyCloudinaryImage(expectedPublicId).catch((err: unknown) =>
        logger.warn(
          { err, publicId: expectedPublicId },
          "confirmCover: falha ao remover asset fora do padrão",
        ),
      );
      throw new AppError("Arquivo fora dos formatos aceitos. Envie JPG, PNG ou WebP.", 400);
    }

    if (!versionOk) {
      throw new AppError("Versão da imagem desatualizada. Envie o arquivo novamente.", 400);
    }

    const existing = await this.barbershopRepository.findPageTheme(data.barbershopId);

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
        coverUrl: resource.secureUrl,
        coverPublicId: expectedPublicId,
        // Original p/ o front recortar sem ampliar; focal preservado (novo
        // asset mantém o enquadramento já ajustado; padrão 50/50).
        coverWidth: resource.width,
        coverHeight: resource.height,
        coverFocalX: existing?.coverFocalX ?? 50,
        coverFocalY: existing?.coverFocalY ?? 50,
      });
    } catch (err) {
      await this.storageProvider.deleteObject(expectedPublicId).catch(() => undefined);
      throw err;
    }
  }
}
