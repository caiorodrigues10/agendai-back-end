import { prisma } from "@/libs/prismaClient";

export type AccessAction = "LOGIN" | "LOGIN_FAILED" | "LOGOUT" | "REFRESH" | "REGISTER" | "GOOGLE_LOGIN" | "REVOKE_ALL_SESSIONS";

interface LogAccessParams {
  userId?: string;
  email?: string;
  action: AccessAction;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
}

export async function logAccess(params: LogAccessParams): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        userId: params.userId ?? null,
        email: params.email ?? null,
        action: params.action,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        success: params.success ?? true,
      },
    });
  } catch (err) {
    // Access logging should never crash the request
    console.error("[AccessLog] Failed to write:", (err as Error)?.message ?? err);
  }
}
