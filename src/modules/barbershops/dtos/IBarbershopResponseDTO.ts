export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  createdAt: Date;
  active: boolean;
}
