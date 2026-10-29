export interface ICreateServiceDTO {
  categoryId?: string | null;
  barbershopId: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  commissionPercent?: number;
  /** Padrão true: serviço público. false = interno (audiência, diligência, despacho). */
  publicBookable?: boolean;
}
