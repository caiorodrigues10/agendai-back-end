import { prisma } from "@/libs/prismaClient";
import { Prisma, type BarbershopPageTheme } from "@prisma/client";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import {
  IBarbershopRepository,
  IPageThemeDTO,
  IUpdatePageThemeDTO,
  PageThemeVariantColorsDTO,
} from "../../repositories/IBarbershopRepository";
import { isHexColor, normalizeHexColor } from "../../utils/pageThemeContrast";
import { orderSocialLinks } from "../../utils/socialLinks";

const shopSelect = {
  id: true,
  name: true,
  whatsapp: true,
  logoUrl: true,
  logoPublicId: true,
  googleReviewUrl: true,
  cnpj: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  operationMode: true,
  openingMode: true,
  businessSegment: true,
  // Texto livre "Qual é o seu tipo de negócio?" (OTHER) — informação de
  // configuração interna do dono, não da vitrine: fica fora do select público.
  businessSegmentOther: true,
  // Público atendido é informação do vitrine ("Atendemos: feminino"), não dado
  // interno — entra no select autenticado e no público de propósito.
  targetAudience: true,
  manualStatus: true,
  // Redes sociais do dono entram no select público de propósito: é conteúdo
  // do perfil (ícones no cabeçalho e na aba Sobre). Ordem/sanitização via
  // withSocialLinks (JsonValue não casa estruturalmente com o DTO).
  socialLinks: true,
  createdAt: true,
  active: true,
  evolutionInstanceName: true,
} as const;

// Select das rotas PÚBLICAS (GET /barbershops e GET /barbershops/:id), que não
// exigem autenticação. Sempre sem `evolutionInstanceName`: é o nome da instância
// Evolution/WhatsApp, identificador interno usado para parear e enviar mensagens
// (ver WhatsAppConnectionUseCase e enqueueWhatsApp). Vazá-lo permitia que qualquer
// visitante listasse a instância de todos os salões. O frontend não consome o
// campo; os fluxos autenticados continuam em `shopSelect` via findById.
// `businessSegmentOther` também fica de fora: texto livre interno do dono.
const { evolutionInstanceName: _evolutionInstanceName, businessSegmentOther: _businessSegmentOther, logoPublicId: _logoPublicId, ...publicShopSelect } = shopSelect;

const VARIANT_COLOR_FIELDS = [
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "textMutedColor",
] as const;

/** JSON do Prisma (`JsonValue`) → DTO estruturado; shape inválido/corrompido = null. */
function toVariantColors(value: unknown): PageThemeVariantColorsDTO | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const colors = {} as PageThemeVariantColorsDTO;
  for (const field of VARIANT_COLOR_FIELDS) {
    const hex = record[field];
    if (typeof hex !== "string" || !isHexColor(hex)) return null;
    colors[field] = normalizeHexColor(hex);
  }
  return colors;
}

/** DTO → input de JSON do Prisma: `undefined` mantém a linha; `null` limpa a coluna. */
function toPrismaJson(
  value: PageThemeVariantColorsDTO | null | undefined,
): typeof Prisma.DbNull | PageThemeVariantColorsDTO | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value;
}

/** Row Prisma → DTO: `socialLinks` (JsonValue) sai ordenado e só com redes conhecidas. */
function withSocialLinks<T extends { socialLinks: unknown }>(
  row: T
): Omit<T, "socialLinks"> & { socialLinks: Record<string, string> | null } {
  return { ...row, socialLinks: orderSocialLinks(row.socialLinks) };
}

/**
 * Row → DTO (mapeamento explícito): `lightColors`/`darkColors` são `JsonValue`
 * no client do Prisma e não casam estruturalmente com o DTO. `darkColors`
 * nulo (linha antiga) cai nas colunas planas, que são o espelho legado.
 */
function mapPageThemeRow(row: BarbershopPageTheme): IPageThemeDTO {
  const darkColors =
    toVariantColors(row.darkColors) ?? {
      accentColor: normalizeHexColor(row.accentColor),
      backgroundColor: normalizeHexColor(row.backgroundColor),
      surfaceColor: normalizeHexColor(row.surfaceColor),
      textColor: normalizeHexColor(row.textColor),
      textMutedColor: normalizeHexColor(row.textMutedColor),
    };
  return {
    id: row.id,
    barbershopId: row.barbershopId,
    presetKey: row.presetKey,
    accentColor: row.accentColor,
    backgroundColor: row.backgroundColor,
    surfaceColor: row.surfaceColor,
    textColor: row.textColor,
    textMutedColor: row.textMutedColor,
    radiusStyle: row.radiusStyle,
    buttonStyle: row.buttonStyle,
    mode: row.mode,
    lightColors: toVariantColors(row.lightColors),
    darkColors,
    coverUrl: row.coverUrl,
    coverPublicId: row.coverPublicId,
    coverOverlay: row.coverOverlay,
    coverFocalX: row.coverFocalX,
    coverFocalY: row.coverFocalY,
    coverWidth: row.coverWidth,
    coverHeight: row.coverHeight,
  };
}

export class BarbershopRepository implements IBarbershopRepository {
  async create(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    const row = await prisma.barbershop.create({
      data,
      select: shopSelect
    });
    return withSocialLinks(row);
  }
  async findById(id: string): Promise<IBarbershopResponseDTO | null> {
    const row = await prisma.barbershop.findUnique({
      where: { id },
      select: shopSelect
    });
    return row ? withSocialLinks(row) : null;
  }
  async list(): Promise<IBarbershopResponseDTO[]> {
    const rows = await prisma.barbershop.findMany({
      orderBy: { name: "asc" },
      select: publicShopSelect
    });
    return rows.map(withSocialLinks);
  }
  async findByIdPublic(id: string): Promise<IBarbershopResponseDTO | null> {
    const row = await prisma.barbershop.findUnique({
      where: { id },
      select: publicShopSelect
    });
    return row ? withSocialLinks(row) : null;
  }
  async update(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    const { socialLinks, ...rest } = data;
    const row = await prisma.barbershop.update({
      where: { id },
      data: {
        ...rest,
        // null limpa o JSON (SQL NULL); undefined não altera a coluna.
        ...(socialLinks !== undefined
          ? { socialLinks: socialLinks === null ? Prisma.DbNull : socialLinks }
          : {})
      },
      select: shopSelect
    });
    return withSocialLinks(row);
  }
  async deactivate(id: string): Promise<void> {
    await prisma.barbershop.update({
      where: { id },
      data: { active: false }
    });
  }
  async getSchedule(barbershopId: string): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>> {
    const schedules = await prisma.schedule.findMany({
      where: { barbershopId },
      orderBy: { dayOfWeek: "asc" },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true }
    });
    return schedules;
  }
  async updateSchedule(
    barbershopId: string,
    schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
  ): Promise<void> {
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { barbershopId } }),
      prisma.schedule.createMany({
        data: schedule.map((s) => ({ barbershopId, ...s }))
      })
    ]);
  }

  async findPageTheme(barbershopId: string): Promise<IPageThemeDTO | null> {
    const row = await prisma.barbershopPageTheme.findUnique({ where: { barbershopId } });
    return row ? mapPageThemeRow(row) : null;
  }

  async upsertPageTheme(barbershopId: string, data: IUpdatePageThemeDTO): Promise<IPageThemeDTO> {
    const { lightColors, darkColors, ...rest } = data;
    const row = await prisma.barbershopPageTheme.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        ...rest,
        lightColors: toPrismaJson(lightColors),
        darkColors: toPrismaJson(darkColors),
      },
      update: {
        ...rest,
        lightColors: toPrismaJson(lightColors),
        darkColors: toPrismaJson(darkColors),
      },
    });
    return mapPageThemeRow(row);
  }
}
