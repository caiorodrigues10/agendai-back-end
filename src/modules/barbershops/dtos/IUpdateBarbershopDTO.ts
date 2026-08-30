export interface IUpdateBarbershopDTO {
  name?: string;
  whatsapp?: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
  active?: boolean;
  /** Nome da instância Evolution — gravado pelo pairing, não pelo PATCH genérico. */
  evolutionInstanceName?: string | null;
}
