import { BusinessSegment, TargetAudience } from './IBarbershopResponseDTO';

export interface ICreateBarbershopDTO {
  name: string;
  whatsapp: string;
  logoUrl?: string;
  googleReviewUrl?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  businessSegment?: BusinessSegment;
  targetAudience?: TargetAudience | null;
}
