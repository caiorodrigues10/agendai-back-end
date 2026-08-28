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
  googleSub?: string | null;
  emailVerified?: boolean;
  deletedAt?: Date | null;
  termsVersion?: string | null;
  termsAcceptedAt?: Date | null;
  marketingOptIn?: boolean;
  marketingOptInAt?: Date | null;
  lgpdConsentAt?: Date | null;
  avatarUrl?: string | null;
}