export interface IServiceResponseDTO {
  categoryId?: string | null;
  id: string;
  barbershopId: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  createdAt: Date;
  active: boolean;
  commissionPercent: number;
}
