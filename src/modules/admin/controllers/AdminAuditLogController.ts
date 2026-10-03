import { FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import { prisma } from "@/libs/prismaClient";

interface AuditLogQuery {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  shopId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
}

interface AuditLogRow {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

type AccessLogRow = {
  userId: string | null;
  email: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

type UserRow = { id: string; name: string; email: string };

const DAY_MS = 86_400_000;
const ALERTS_WINDOW_MS = DAY_MS;
const SESSIONS_WINDOW_MS = DAY_MS;
const ALERTS_TAKE = 200;
const SESSIONS_TAKE = 200;
const ACTIVE_SESSION_MS = 30 * 60 * 1000;
const EXPORT_BATCH = 1000;

const SENSITIVE_GROUPS: Array<{ key: string; label: string }> = [
  { key: "impersonation", label: "Impersonation" },
  { key: "accounts", label: "Contas" },
  { key: "deletions", label: "Exclusões" },
  { key: "blocks", label: "Bloqueios" },
  { key: "others", label: "Outras ações sensíveis" },
];

const isSensitive = (action: string): boolean =>
  action.startsWith("ACCOUNT_") ||
  action.startsWith("DELETE ") ||
  action.startsWith("BLOCK_") ||
  action.startsWith("UNBLOCK_") ||
  action.includes("/impersonate");

const sensitiveGroup = (action: string): string => {
  if (action.includes("IMPERSONATE") || action.includes("/impersonate")) return "impersonation";
  if (action.startsWith("ACCOUNT_")) return "accounts";
  if (action.startsWith("DELETE ")) return "deletions";
  if (action.startsWith("BLOCK_") || action.startsWith("UNBLOCK_")) return "blocks";
  return "others";
};

const buildWhere = (query: AuditLogQuery): Record<string, any> => {
  const where: Record<string, any> = {};

  if (query.userId) where.userId = query.userId;
  if (query.action) {
    where.action = { contains: query.action, mode: "insensitive" };
  }
  if (query.resource) {
    where.resource = { contains: query.resource, mode: "insensitive" };
  }

  const orConditions: Array<Record<string, any>> = [];
  if (query.shopId) {
    // AuditLog não tem coluna de salão: em ações de conta o resourceId é o
    // shop id e nas rotas HTTP o uuid aparece na action (ex.: /barbershops/<id>/...).
    orConditions.push({ resourceId: query.shopId }, { action: { contains: query.shopId } });
  }
  if (query.search) {
    orConditions.push(
      { action: { contains: query.search, mode: "insensitive" } },
      { resource: { contains: query.search, mode: "insensitive" } },
      { details: { contains: query.search, mode: "insensitive" } },
    );
  }
  if (orConditions.length > 0) where.OR = orConditions;

  const range: Record<string, Date> = {};
  if (query.from) range.gte = new Date(query.from);
  if (query.to) range.lte = new Date(query.to);
  if (query.from || query.to) where.createdAt = range;

  return where;
};

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvLine = (log: AuditLogRow): string =>
  [
    log.createdAt.toISOString(),
    log.action,
    log.resource,
    log.resourceId ?? "",
    log.userId,
    log.ipAddress ?? "",
    (log.details ?? "").replace(/\r?\n/g, " "),
  ]
    .map(csvCell)
    .join(",");

const CSV_HEADER =
  "createdAt,action,resource,resourceId,userId,ipAddress,details\r\n";

/** Export em lotes via cursor — sem teto de registros. */
async function* auditCsvRows(where: Record<string, any>): AsyncGenerator<string> {
  yield CSV_HEADER;
  let cursor: string | undefined;
  for (;;) {
    const batch: AuditLogRow[] = await prisma.auditLog.findMany({
      where,
      take: EXPORT_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        userId: true,
        action: true,
        resource: true,
        resourceId: true,
        details: true,
        ipAddress: true,
        createdAt: true,
      },
    });
    for (const log of batch) yield `${csvLine(log)}\r\n`;
    if (batch.length < EXPORT_BATCH) return;
    cursor = batch[batch.length - 1].id;
  }
}

const loadUsers = async (ids: string[]): Promise<Map<string, UserRow>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users: UserRow[] = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user: UserRow) => [user.id, user]));
};

export class AdminAuditLogController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as AuditLogQuery;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const where = buildWhere(query);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.status(200).send({
      success: true,
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  }

  async export(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as AuditLogQuery;
    const where = buildWhere(query);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    return reply
      .status(200)
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="audit-logs-${stamp}.csv"`)
      .send(Readable.from(auditCsvRows(where)));
  }

  /** Facetas para os filtros: recursos distintos, usuários com logs e salões. */
  async facets(_request: FastifyRequest, reply: FastifyReply) {
    const [resourceRows, userIdRows, shops] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["resource"], orderBy: { resource: "asc" } }),
      prisma.auditLog.groupBy({ by: ["userId"] }),
      prisma.barbershop.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 100,
      }),
    ]);

    const users = await loadUsers(userIdRows.map((row: { userId: string }) => row.userId));

    return reply.status(200).send({
      success: true,
      data: {
        resources: resourceRows.map((row: { resource: string }) => row.resource),
        users: [...users.values()].sort((a: UserRow, b: UserRow) =>
          a.name.localeCompare(b.name),
        ),
        shops: shops.map((shop: { id: string; name: string }) => ({
          id: shop.id,
          name: shop.name,
        })),
      },
    });
  }

  /** Ações sensíveis das últimas 24h agrupadas + eventos recentes. */
  async alerts(_request: FastifyRequest, reply: FastifyReply) {
    const since = new Date(Date.now() - ALERTS_WINDOW_MS);
    const logs: AuditLogRow[] = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: ALERTS_TAKE,
    });

    const sensitive = logs.filter((log: AuditLogRow) => isSensitive(log.action));
    const counts = new Map<string, number>();
    sensitive.forEach((log: AuditLogRow) => {
      const key = sensitiveGroup(log.action);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const recent = sensitive.slice(0, 10);
    const users = await loadUsers(recent.map((log: AuditLogRow) => log.userId));

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        windowHours: 24,
        total: sensitive.length,
        byGroup: SENSITIVE_GROUPS.map((group) => ({
          ...group,
          count: counts.get(group.key) ?? 0,
        })),
        recent: recent.map((log: AuditLogRow) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          userId: log.userId,
          userName: users.get(log.userId)?.name ?? null,
          createdAt: log.createdAt,
        })),
      },
    });
  }

  /** Sessões por acesso (login/refresh/logout) nas últimas 24h. */
  async sessions(_request: FastifyRequest, reply: FastifyReply) {
    const now = Date.now();
    const since = new Date(now - SESSIONS_WINDOW_MS);
    const rows: AccessLogRow[] = await prisma.accessLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: SESSIONS_TAKE,
    });

    const latest = new Map<string, AccessLogRow>();
    rows.forEach((row: AccessLogRow) => {
      const key = `${row.userId ?? row.email ?? "-"}|${row.ipAddress ?? "-"}`;
      if (!latest.has(key)) latest.set(key, row);
    });

    const sessions = [...latest.entries()].map(([key, row]: [string, AccessLogRow]) => {
      const status =
        row.action === "LOGOUT"
          ? "CLOSED"
          : row.createdAt.getTime() >= now - ACTIVE_SESSION_MS
            ? "ACTIVE"
            : "EXPIRED";
      return {
        key,
        userId: row.userId,
        email: row.email,
        ip: row.ipAddress,
        userAgent: row.userAgent,
        lastEvent: row.action,
        lastAt: row.createdAt,
        status,
      };
    });
    sessions.sort(
      (a: { lastAt: Date }, b: { lastAt: Date }) => b.lastAt.getTime() - a.lastAt.getTime(),
    );

    const users = await loadUsers(
      sessions
        .map((session: { userId: string | null }) => session.userId)
        .filter((id: string | null): id is string => id !== null),
    );

    return reply.status(200).send({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        windowHours: 24,
        sessions: sessions.map((session) => ({
          ...session,
          name: session.userId ? (users.get(session.userId)?.name ?? null) : null,
        })),
      },
    });
  }
}
