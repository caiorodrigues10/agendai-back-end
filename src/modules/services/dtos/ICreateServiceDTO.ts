export interface ICreateServiceDTO {
  barbershopId: string;
  categoryId?: string | null;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
}
