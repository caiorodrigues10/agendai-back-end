import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import {
  GetTrafficReportUseCase,
  type TrafficReportPayload,
  type TrafficReportQuery,
} from "../application/useCases/GetTrafficReportUseCase";
import {
  trafficReportQuerySchema,
  type TrafficReportQueryInput,
} from "../schemas/trafficSchemas";

/**
 * Presentation for the master-admin traffic report (`/admin/traffic*`).
 *
 * The report is read-only and carries no personal data: counters, signup
 * counts and referrer *hosts* only. Authorization happens in the route
 * preHandlers (MASTER_ADMIN + `internal:traffic:read`).
 */
export class TrafficReportController {
  async report(request: FastifyRequest, reply: FastifyReply) {
    const query = trafficReportQuerySchema.parse(request.query);
    const useCase = container.resolve(GetTrafficReportUseCase);
    const payload = await useCase.execute(toTrafficReportQuery(query));
    return reply.status(200).send({ success: true, data: payload });
  }

  /** CSV export of the same series (one row per bucket). */
  async export(request: FastifyRequest, reply: FastifyReply) {
    const query = trafficReportQuerySchema.parse(request.query);
    const useCase = container.resolve(GetTrafficReportUseCase);
    const payload = await useCase.execute(toTrafficReportQuery(query));

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return reply
      .status(200)
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="site-traffic-${stamp}.csv"`)
      .send(buildTrafficCsv(payload));
  }
}

/** Normalize the two public anchors into one internal civil-day anchor. */
export function toTrafficReportQuery(query: TrafficReportQueryInput): TrafficReportQuery {
  return {
    period: query.period,
    area: query.area,
    userRole: query.userRole,
    referenceDay: query.date ?? (query.month ? `${query.month}-01` : undefined),
  };
}

/** Header row uses the same pt-BR labels as the screen catalog. */
const CSV_HEADER = [
  "bucket",
  "rotulo",
  "visitas",
  "visitantes",
  "sessoes",
  "novas_barbearias",
  "novos_usuarios",
  "novos_usuarios_removidos",
  "parcial",
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

export function buildTrafficCsv(payload: TrafficReportPayload): string {
  const lines: string[] = [csvLine(CSV_HEADER)];
  for (const point of payload.series) {
    lines.push(
      csvLine([
        point.bucketStart,
        point.label,
        point.visits,
        point.visitors,
        point.sessions ?? "",
        point.newShops,
        point.newUsers,
        point.newUsersRemoved,
        point.partial ? "sim" : "nao",
      ]),
    );
  }
  return lines.join("");
}
