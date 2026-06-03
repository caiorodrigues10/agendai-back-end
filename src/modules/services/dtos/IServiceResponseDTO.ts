export interface IServiceResponseDTO {
  id: string;
  barbershopId: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  createdAt: Date;
  active: boolean;
}
