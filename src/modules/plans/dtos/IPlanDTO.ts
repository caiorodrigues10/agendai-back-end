export interface ICreatePlanDTO {
  name: string;
  description?: string;
  price: number;
  maxEmployees: number;
  features: string[];
}

export interface IUpdatePlanDTO {
  name?: string;
  description?: string;
  price?: number;
  maxEmployees?: number;
  features?: string[];
  active?: boolean;
}

export interface IPlanResponseDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  maxEmployees: number;
  features: string[];
  active: boolean;
  createdAt: Date;
}