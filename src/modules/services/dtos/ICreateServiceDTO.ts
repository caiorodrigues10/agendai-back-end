export interface ICreateServiceDTO {
  categoryId?: string | null;
  barbershopId: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  commissionPercent?: number;
}
