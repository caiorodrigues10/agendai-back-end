export interface IUpdateBarbershopDTO {
  name?: string;
  whatsapp?: string;
  logoUrl?: string | null;
  active?: boolean;
  /** Nome da instância Evolution — gravado pelo pairing, não pelo PATCH genérico. */
  evolutionInstanceName?: string | null;
}
