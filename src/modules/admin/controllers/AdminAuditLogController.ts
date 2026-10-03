import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";

interface AuditLogQuery {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
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

const EXPORT_LIMIT = 5000;

const buildWhere = (query: AuditLogQuery): Record<string, any> => {
  const where: Record<string, any> = {};

  if (query.userId) where.userId = query.userId;
  if (query.action) {
    where.action = { contains: query.action, mode: "insensitive" };
  }
  if (query.resource) {
    where.resource = { contains: query.resource, mode: "insensitive" };
  }
  if (query.search) {
    where.OR = [
      { action: { contains: query.search, mode: "insensitive" } },
      { resource: { contains: query.search, mode: "insensitive" } },
      { details: { contains: query.search, mode: "insensitive" } },
    ];
  }

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

const toCsv = (logs: AuditLogRow[]): string => {
  const header = ["createdAt", "action", "resource", "resourceId", "userId", "ipAddress", "details"];
  const lines = logs.map((log) =>
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
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
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

    const logs = await prisma.auditLog.findMany({
      where,
      take: EXPORT_LIMIT,
      orderBy: { createdAt: "desc" },
    });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    return reply
      .status(200)
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="audit-logs-${stamp}.csv"`)
      .send(toCsv(logs));
  }
}
