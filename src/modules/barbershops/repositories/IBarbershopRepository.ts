import { ICreateBarbershopDTO } from "../dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../dtos/IBarbershopResponseDTO";

/** Type alias (não interface) de propósito: precisa de index signature implícito para casar com `InputJsonValue` do Prisma. */
export type PageThemeVariantColorsDTO = {
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
};

export interface IPageThemeDTO {
  id: string;
  barbershopId: string;
  presetKey: string | null;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  radiusStyle: string;
  buttonStyle: string;
  /// AUTO | LIGHT | DARK (ausente em linhas antigas = AUTO).
  mode: string;
  /// Variantes completas; darkColors nulo = legado (usa as colunas planas acima).
  lightColors: PageThemeVariantColorsDTO | null;
  darkColors: PageThemeVariantColorsDTO | null;
  coverUrl: string | null;
  coverPublicId: string | null;
  coverOverlay: number;
}

export interface IUpdatePageThemeDTO {
  presetKey?: string | null;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  radiusStyle: string;
  buttonStyle: string;
  mode?: string;
  lightColors?: PageThemeVariantColorsDTO | null;
  darkColors?: PageThemeVariantColorsDTO | null;
  coverUrl?: string | null;
  coverPublicId?: string | null;
  coverOverlay: number;
}

export interface IBarbershopRepository {
  create(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO>;
  findById(id: string): Promise<IBarbershopResponseDTO | null>;
  /** Leitura PÚBLICA: nunca expõe `evolutionInstanceName` (ver BarbershopRepository). */
  findByIdPublic(id: string): Promise<IBarbershopResponseDTO | null>;
  list(): Promise<IBarbershopResponseDTO[]>;
  update(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO>;
  deactivate(id: string): Promise<void>;
  getSchedule(barbershopId: string): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>>;
  updateSchedule(barbershopId: string, schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>): Promise<void>;
  findPageTheme(barbershopId: string): Promise<IPageThemeDTO | null>;
  upsertPageTheme(barbershopId: string, data: IUpdatePageThemeDTO): Promise<IPageThemeDTO>;
}
