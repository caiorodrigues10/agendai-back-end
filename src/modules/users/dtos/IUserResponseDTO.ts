type RoleLiteral = "MASTER_ADMIN" | "OWNER" | "EMPLOYEE" | "CUSTOMER";

export type EmployeePermission =
  | "QUEUE_MANAGE"
  | "APPOINTMENTS_MANAGE"
  | "APPOINTMENTS_VIEW_ALL"
  | "APPOINTMENTS_CANCEL"
  | "CLIENTS_MANAGE"
  | "PACKAGES_SELL"
  | "FINANCE_VIEW"
  | "FINANCE_MANAGE"
  | "REPORTS_VIEW"
  | "MARKETING_MANAGE"
  | "CRM_ANALYTICS_VIEW"
  | "CRM_CAMPAIGNS_MANAGE"
  | "PRODUCTS_VIEW"
  | "PRODUCTS_MANAGE"
  | "INVENTORY_MANAGE"
  | "RETAIL_SELL"
  | "RETAIL_REFUND"
  | "PRODUCT_REPORTS_VIEW";

export const ALL_PERMISSIONS: EmployeePermission[] = [
  "QUEUE_MANAGE",
  "APPOINTMENTS_MANAGE",
  "APPOINTMENTS_VIEW_ALL",
  "APPOINTMENTS_CANCEL",
  "CLIENTS_MANAGE",
  "PACKAGES_SELL",
  "FINANCE_VIEW",
  "FINANCE_MANAGE",
  "REPORTS_VIEW",
  "MARKETING_MANAGE",
  "CRM_ANALYTICS_VIEW",
  "CRM_CAMPAIGNS_MANAGE",
  "PRODUCTS_VIEW",
  "PRODUCTS_MANAGE",
  "INVENTORY_MANAGE",
  "RETAIL_SELL",
  "RETAIL_REFUND",
  "PRODUCT_REPORTS_VIEW",
];

/** Default permissions for EMPLOYEE role on creation */
export const DEFAULT_EMPLOYEE_PERMISSIONS: EmployeePermission[] = [
  "QUEUE_MANAGE",
  "APPOINTMENTS_MANAGE",
  "CLIENTS_MANAGE",
  "PACKAGES_SELL",
];

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
  permissions?: EmployeePermission[];
}
