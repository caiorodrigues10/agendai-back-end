import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";
import {
  evaluateThemeContrast,
  failingContrastChecks,
  normalizeHexColor,
} from "../../utils/pageThemeContrast";
import { assertOwnerShop } from "./GetPageThemeUseCase";
import { UpdatePageThemeBody } from "../../schemas/pageThemeSchemas";

@injectable()
export class UpdatePageThemeUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
  ) {}

  async execute(
    barbershopId: string,
    data: UpdatePageThemeBody,
    requestingUser: { role: string; barbershopId?: string },
  ): Promise<IPageThemeDTO> {
    assertOwnerShop(requestingUser, barbershopId);

    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);

    const existing = await this.barbershopRepository.findPageTheme(barbershopId);

    const colors = {
      accentColor: normalizeHexColor(data.accentColor),
      backgroundColor: normalizeHexColor(data.backgroundColor),
      surfaceColor: normalizeHexColor(data.surfaceColor),
      textColor: normalizeHexColor(data.textColor),
      textMutedColor: normalizeHexColor(data.textMutedColor),
    };

    const failing = failingContrastChecks(evaluateThemeContrast(colors));
    if (failing.length > 0) {
      const detail = failing
        .map(
          check =>
            `${check.leftLabel} × ${check.rightLabel}: ${check.ratio} (mínimo ${check.minRatio})`,
        )
        .join("; ");
      throw new AppError(`Cores com contraste insuficiente — ${detail}.`, 400);
    }

    let coverUrl = existing?.coverUrl ?? null;
    let coverPublicId = existing?.coverPublicId ?? null;
    if (data.coverUrl !== undefined || data.coverPublicId !== undefined) {
      if (!data.coverUrl || !data.coverPublicId) {
        throw new AppError("coverUrl e coverPublicId devem ser enviados juntos.", 400);
      }
      const expectedPrefix = `agendaja/${barbershopId}/cover/`;
      if (!data.coverPublicId.startsWith(expectedPrefix)) {
        throw new AppError("coverPublicId não pertence à pasta Cloudinary deste salão.", 400);
      }
      if (!data.coverUrl.includes("/image/upload/") || !data.coverUrl.includes(data.coverPublicId)) {
        throw new AppError("coverUrl não corresponde ao coverPublicId informado.", 400);
      }
      coverUrl = data.coverUrl;
      coverPublicId = data.coverPublicId;
    }

    return this.barbershopRepository.upsertPageTheme(barbershopId, {
      presetKey: data.presetKey ?? null,
      ...colors,
      radiusStyle: data.radiusStyle,
      buttonStyle: data.buttonStyle,
      coverOverlay: data.coverOverlay,
      coverUrl,
      coverPublicId,
    });
  }
}
