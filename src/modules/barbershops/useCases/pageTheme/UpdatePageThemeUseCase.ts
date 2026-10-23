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
  type PageThemeVariantColors,
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

    // Colunas planas = espelho legado do darkColors (formato antigo mapeado
    // para a variante escura). lightColors ausente = ainda não materializada.
    const darkColors: PageThemeVariantColors = data.darkColors
      ? {
          accentColor: normalizeHexColor(data.darkColors.accentColor),
          backgroundColor: normalizeHexColor(data.darkColors.backgroundColor),
          surfaceColor: normalizeHexColor(data.darkColors.surfaceColor),
          textColor: normalizeHexColor(data.darkColors.textColor),
          textMutedColor: normalizeHexColor(data.darkColors.textMutedColor),
        }
      : colors;
    const lightColors: PageThemeVariantColors | null = data.lightColors
      ? {
          accentColor: normalizeHexColor(data.lightColors.accentColor),
          backgroundColor: normalizeHexColor(data.lightColors.backgroundColor),
          surfaceColor: normalizeHexColor(data.lightColors.surfaceColor),
          textColor: normalizeHexColor(data.lightColors.textColor),
          textMutedColor: normalizeHexColor(data.lightColors.textMutedColor),
        }
      : null;
    const mode = data.mode ?? "AUTO";

    const assertVariantContrast = (
      variantColors: PageThemeVariantColors,
      variantLabel: "escura" | "clara",
    ): void => {
      const failing = failingContrastChecks(evaluateThemeContrast(variantColors));
      if (failing.length > 0) {
        const detail = failing
          .map(
            check =>
              `${check.leftLabel} × ${check.rightLabel}: ${check.ratio} (mínimo ${check.minRatio})`,
          )
          .join("; ");
        throw new AppError(
          `Cores com contraste insuficiente (variante ${variantLabel}) — ${detail}.`,
          400,
        );
      }
    };

    assertVariantContrast(darkColors, "escura");
    if (lightColors) assertVariantContrast(lightColors, "clara");

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
      // Colunas planas: espelho legado do darkColors (og-image e leitores antigos).
      accentColor: darkColors.accentColor,
      backgroundColor: darkColors.backgroundColor,
      surfaceColor: darkColors.surfaceColor,
      textColor: darkColors.textColor,
      textMutedColor: darkColors.textMutedColor,
      radiusStyle: data.radiusStyle,
      buttonStyle: data.buttonStyle,
      mode,
      lightColors,
      darkColors,
      coverOverlay: data.coverOverlay,
      coverUrl,
      coverPublicId,
      // Dimensões originais são do servidor (upload/confirmação) — aqui só
      // preservam. Focal vem do body (0–100); ausente = mantém o atual/50.
      coverWidth: existing?.coverWidth ?? null,
      coverHeight: existing?.coverHeight ?? null,
      coverFocalX: data.coverFocalX ?? existing?.coverFocalX ?? 50,
      coverFocalY: data.coverFocalY ?? existing?.coverFocalY ?? 50,
    });
  }
}
