export interface ICreateServiceCategoryDTO {
  barbershopId: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface IUpdateServiceCategoryDTO {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  active?: boolean;
}

export interface IServiceCategoryResponseDTO {
  id: string;
  barbershopId: string | null;
  isGlobal: boolean;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateExpenseCategoryDTO {
  barbershopId: string | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
}

export interface IUpdateExpenseCategoryDTO {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  active?: boolean;
}

export interface IExpenseCategoryResponseDTO {
  id: string;
  barbershopId: string | null;
  isGlobal: boolean;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}