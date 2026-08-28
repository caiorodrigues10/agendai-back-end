export function mapRole(role: string): "admin" | "owner" | "employee" | "customer" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  if (role === "CUSTOMER") return "customer";
  return "employee";
}

export function parseDuration(input: string): number {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}
