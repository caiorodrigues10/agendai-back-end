export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  createdAt: Date;
  active: boolean;
  /** Nome da instância da Evolution API desta barbearia (fallback para env global se vazio). */
  evolutionInstanceName?: string | null;
}
