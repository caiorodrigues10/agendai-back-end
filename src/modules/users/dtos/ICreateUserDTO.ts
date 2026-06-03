type RoleLiteral = "MASTER_ADMIN" | "OWNER" | "EMPLOYEE";

export interface ICreateUserDTO {
  name: string;
  email: string;
  password: string;
  role?: RoleLiteral;
  barbershopId?: string;
}
