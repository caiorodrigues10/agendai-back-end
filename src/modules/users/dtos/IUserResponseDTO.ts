type RoleLiteral = "MASTER_ADMIN" | "OWNER" | "EMPLOYEE";

export interface IUserResponseDTO {
  id: string;
  name: string;
  email: string;
  role: RoleLiteral;
  barbershopId?: string | null;
  cpf: string | null;  
  createdAt: Date;
  active: boolean;
  password?: string;
}