import type {
  BusinessSegment as PrismaBusinessSegment,
  ManualShopStatus as PrismaManualShopStatus,
  OpeningMode as PrismaOpeningMode,
  OperationMode as PrismaOperationMode,
  TargetAudience as PrismaTargetAudience,
} from '@prisma/client';

// Derivados do Prisma de propósito: um union à mão aqui já divergiu do schema
// (faltava PETSHOP) e quebrava o typecheck assim que o enum crescia.
export type OperationMode = PrismaOperationMode;
export type ManualShopStatus = PrismaManualShopStatus;
export type OpeningMode = PrismaOpeningMode;
export type BusinessSegment = PrismaBusinessSegment;
export type TargetAudience = PrismaTargetAudience;

export interface ShopOpenStateDTO {
  open: boolean;
  reason: string;
  queueClosed: boolean;
}

export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  /** public_id do Cloudinary da logo (interno; fora das rotas públicas). */
  logoPublicId?: string | null;
  googleReviewUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operationMode: OperationMode;
  openingMode?: OpeningMode;
  businessSegment?: BusinessSegment;
  /** Texto livre do dono quando o segmento é OTHER. Só no fluxo autenticado. */
  businessSegmentOther?: string | null;
  targetAudience?: TargetAudience | null;
  manualStatus?: ManualShopStatus;
  createdAt: Date;
  active: boolean;
  /** Nome da instância Evolution — só o fluxo de connect/disconnect altera. */
  evolutionInstanceName?: string | null;
  openState?: ShopOpenStateDTO;
}
