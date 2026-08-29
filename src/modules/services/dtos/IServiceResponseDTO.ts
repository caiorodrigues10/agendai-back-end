export interface IServiceResponseDTO {
  id: string;
  barbershopId: string;
  categoryId: string | null;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  createdAt: Date;
  active: boolean;
}
