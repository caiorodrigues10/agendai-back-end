export interface IUpdateBarbershopDTO {
  name?: string;
  whatsapp?: string;
  logoUrl?: string | null;
  active?: boolean;
  /** Nome da instância da Evolution API desta barbearia (string vazia para resetar / usar fallback). */
  evolutionInstanceName?: string | null;
}
