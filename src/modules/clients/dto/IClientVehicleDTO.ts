export interface ICreateClientVehicleDTO {
  barbershopId: string;
  clientId: string;
  plate: string;
  vehicleModel: string;
  color?: string | null;
  notes?: string | null;
}

export interface IUpdateClientVehicleDTO {
  plate?: string;
  vehicleModel?: string;
  color?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface IClientVehicleResponseDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  plate: string;
  vehicleModel: string;
  color: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
