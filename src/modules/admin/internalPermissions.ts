export const INTERNAL_PERMISSIONS = {
  ALL: "internal:all",
  DASHBOARD_READ: "internal:dashboard:read",
  TEAM_MANAGE: "internal:team:manage",
  SUPPORT_MANAGE: "internal:support:manage",
  FINANCE_READ: "internal:finance:read",
  OPERATIONS_READ: "internal:operations:read",
  REFERRALS_READ: "internal:referrals:read",
  AUDIT_READ: "internal:audit:read",
  BARBERSHOPS_MANAGE: "internal:barbershops:manage",
  ACCOUNTS_MANAGE: "internal:accounts:manage",
  ACCOUNTS_IMPERSONATE: "internal:accounts:impersonate",
  USERS_MANAGE: "internal:users:manage",
} as const;

export type InternalPermission = typeof INTERNAL_PERMISSIONS[keyof typeof INTERNAL_PERMISSIONS];

export const INTERNAL_PROFILE_PERMISSIONS = {
  ADMIN: [INTERNAL_PERMISSIONS.ALL],
  SUPPORT: [
    INTERNAL_PERMISSIONS.DASHBOARD_READ,
    INTERNAL_PERMISSIONS.SUPPORT_MANAGE,
    INTERNAL_PERMISSIONS.OPERATIONS_READ,
    INTERNAL_PERMISSIONS.BARBERSHOPS_MANAGE,
    INTERNAL_PERMISSIONS.ACCOUNTS_MANAGE,
  ],
  FINANCE: [
    INTERNAL_PERMISSIONS.DASHBOARD_READ,
    INTERNAL_PERMISSIONS.FINANCE_READ,
    INTERNAL_PERMISSIONS.REFERRALS_READ,
  ],
  COMMERCIAL: [
    INTERNAL_PERMISSIONS.DASHBOARD_READ,
    INTERNAL_PERMISSIONS.BARBERSHOPS_MANAGE,
    INTERNAL_PERMISSIONS.ACCOUNTS_MANAGE,
    INTERNAL_PERMISSIONS.REFERRALS_READ,
  ],
  READ_ONLY: [
    INTERNAL_PERMISSIONS.DASHBOARD_READ,
    INTERNAL_PERMISSIONS.OPERATIONS_READ,
    INTERNAL_PERMISSIONS.REFERRALS_READ,
  ],
} as const;

export function hasInternalPermission(
  permissions: readonly string[] | undefined,
  required: InternalPermission,
): boolean {
  if (!permissions || permissions.length === 0) return true;
  return permissions.includes(INTERNAL_PERMISSIONS.ALL) || permissions.includes(required);
}
