import { OperationMode, OpeningMode, BusinessSegment, TargetAudience } from './IBarbershopResponseDTO';

export interface IUpdateBarbershopDTO {
  name?: string;
  whatsapp?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
  googleReviewUrl?: string | null;
  active?: boolean;
  operationMode?: OperationMode;
  openingMode?: OpeningMode;
  businessSegment?: BusinessSegment;
  businessSegmentOther?: string | null;
  targetAudience?: TargetAudience | null;
  /** Nome da instância Evolution — gravado pelo pairing, não pelo PATCH genérico. */
  evolutionInstanceName?: string | null;
}
