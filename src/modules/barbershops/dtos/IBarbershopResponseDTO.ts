export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  createdAt: Date;
  active: boolean;
  /** Nome da instância Evolution — só o fluxo de connect/disconnect altera. */
  evolutionInstanceName?: string | null;
}
