type RoleLiteral = "MASTER_ADMIN" | "OWNER" | "EMPLOYEE" | "CUSTOMER";

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